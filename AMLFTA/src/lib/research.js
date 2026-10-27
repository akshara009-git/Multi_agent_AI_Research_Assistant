/* ------------------------------------------------------------------------ *
 * ResearchAI pipeline
 *
 * Real data:   OpenAlex (papers, citations, yearly counts), Semantic Scholar
 *              (second paper source, best effort), Hugging Face (datasets).
 * Real NLP:    TF-IDF relevance ranking, extractive summaries, cue-based
 *              extraction of contribution / method / metrics / datasets /
 *              limitations, limitation clustering (research gaps), term-trend
 *              analysis (emerging topics), co-occurrence knowledge graph.
 *
 * Everything runs in the browser. No API keys are needed.
 * ------------------------------------------------------------------------ */

const OPENALEX = "https://api.openalex.org";
const S2 = "https://api.semanticscholar.org/graph/v1";
const HF = "https://huggingface.co/api";

/* ----------------------------- small helpers ----------------------------- */

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(abortError()); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError() {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

async function getJSON(url, { signal, timeout = 20000, retries = 0 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw abortError();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (e) {
      if (signal?.aborted) throw abortError();
      lastErr = e;
      const retryable = !e.status || e.status === 429 || e.status >= 500;
      if (!retryable || attempt === retries) break;
      await sleep(900 * (attempt + 1), signal);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastErr;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const uniq = (arr) => [...new Set(arr)];
const normTitle = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* ------------------------------- text / NLP ------------------------------ */

const STOP_BASE = new Set((
  "a about above across after again against all almost also although always am among an and any are around as at be because been before being below " +
  "between both but by can cannot could did do does doing done down during each either else enough etc even ever every few for from further had has have " +
  "having he her here hers herself him himself his how however i if in into is it its itself just least less like may me might more moreover most much must " +
  "my myself neither no nor not now of off often on once one ones only onto or other others otherwise our ours ourselves out over own per perhaps quite " +
  "rather really same several she should since so some such than that the their theirs them themselves then there thereby therefore these they this those " +
  "though through throughout thus to together too toward towards under unlike until up upon us use used uses using usually various very via was we well " +
  "were what whatever when whenever where whereas whether which while who whom whose why will with within without would yet you your yours"
).split(/\s+/));

// words that are common in abstracts but say nothing about the topic
const BOILER = new Set((
  "paper papers study studies article work works approach approaches method methods result results show shows shown showed propose proposed proposes " +
  "present presented presents novel new based recent recently research researchers review overview survey introduce introduces introduced demonstrate " +
  "demonstrates demonstrated find finds found address addresses aim aims investigate investigates conduct conducted provide provides provided " +
  "discuss discusses focus focuses key main existing different first second two three four five many high higher highly large larger significant " +
  "significantly important improve improves improved improvement potential due need needs available number technique techniques " +
  "way ways respect compared compare comparison achieve achieves achieved able allow allows including include includes given according " +
  "addition additional future currently remain remains remaining reduce reduces reduced yield yields shows achieving obtain obtains obtained report reports reported leads lead led often rely relies"
).split(/\s+/));

const STOP = new Set([...STOP_BASE, ...BOILER]);

const FILLER_QUERY = new Set((
  "explore explain describe tell give list find show about latest recent newest approaches approach methods method techniques technique advances " +
  "advancements overview review survey papers paper studies study research topic topics information regarding related understand understanding " +
  "using use used for the of in on to and or with how what why which is are can does do"
).split(/\s+/));

const LIMIT_STOP = new Set((
  "limit limited limits limitation limitations challenge challenges challenging lack lacking lacks fail fails failure remain remains future work issue " +
  "issues problem problems difficult difficulty still little poor poorly unclear drawback drawbacks degrade degrades degraded vulnerable however " +
  "performance accuracy effective effectiveness efficient"
).split(/\s+/));

const LY_OK = new Set(["assembly", "anomaly", "supply", "family", "monopoly", "apply", "reply", "ally", "italy", "butterfly", "multiply", "bully"]);
const isAdverb = (w) => w.length >= 6 && w.endsWith("ly") && !LY_OK.has(w);

function stem(w) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("sses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is|ics)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Token stream: array of {s: stem, r: raw} or null where a stopword/short token breaks adjacency. */
function tokenStream(text, minLen = 3) {
  const out = [];
  const re = /[a-z0-9][a-z0-9\-+]*/g;
  const lower = (text || "").toLowerCase();
  let m;
  while ((m = re.exec(lower))) {
    let w = m[0].replace(/[-+]+$/, "");
    if (w.length < minLen || /^\d+$/.test(w) || STOP.has(w) || isAdverb(w)) { out.push(null); continue; }
    out.push({ s: stem(w), r: w });
  }
  return out;
}

function splitSentences(text) {
  if (!text) return [];
  const protectedText = text
    .replace(/\b(e\.g|i\.e|et al|vs|Fig|Figs|approx|cf|Eq|No|Dr|Prof)\./g, (m) => m.replace(".", "∯"))
    .replace(/\b([A-Z])\.(?=\s?[A-Z])/g, "$1∯");
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'([])/)
    .map((s) => s.replace(/∯/g, ".").trim())
    .filter((s) => s.length > 20);
}

function cleanAbstract(t) {
  return (t || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/^\s*abstract[:.\s-]*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function invertedToText(inv) {
  if (!inv) return "";
  const words = [];
  for (const [w, positions] of Object.entries(inv)) for (const p of positions) words[p] = w;
  return words.filter(Boolean).join(" ");
}

/** Corpus statistics (document frequency over unigrams + bigrams). */
function buildCorpus(docs) {
  const N = docs.length;
  const dfUni = new Map(), dfBi = new Map();
  const surface = new Map(); // stem -> Map(raw -> count)
  const parsed = docs.map((d) => {
    const stream = tokenStream(d.text);
    const uni = new Map(), bi = new Map();
    for (let i = 0; i < stream.length; i++) {
      const t = stream[i];
      if (!t) continue;
      uni.set(t.s, (uni.get(t.s) || 0) + 1);
      if (!surface.has(t.s)) surface.set(t.s, new Map());
      const sm = surface.get(t.s);
      sm.set(t.r, (sm.get(t.r) || 0) + 1);
      const n = stream[i + 1];
      if (n && n.s !== t.s) {
        const k = `${t.s} ${n.s}`;
        bi.set(k, (bi.get(k) || 0) + 1);
      }
    }
    for (const k of uni.keys()) dfUni.set(k, (dfUni.get(k) || 0) + 1);
    for (const k of bi.keys()) dfBi.set(k, (dfBi.get(k) || 0) + 1);
    return { id: d.id, uni, bi };
  });
  const idf = (term) => {
    const df = (term.includes(" ") ? dfBi.get(term) : dfUni.get(term)) || 0;
    return Math.log((N + 1) / (df + 1)) + 1;
  };
  const display = (term) =>
    term.split(" ").map((s) => {
      const sm = surface.get(s);
      if (!sm) return s;
      return [...sm.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    }).join(" ");
  const vec = (p) => {
    const v = new Map();
    let norm = 0;
    for (const [t, c] of p.uni) { const w = (1 + Math.log(c)) * idf(t); v.set(t, w); norm += w * w; }
    return { v, norm: Math.sqrt(norm) || 1 };
  };
  return { N, parsed, dfUni, dfBi, idf, display, vec };
}

function cosine(a, b) {
  let dot = 0;
  const [small, big] = a.v.size < b.v.size ? [a, b] : [b, a];
  for (const [t, w] of small.v) { const o = big.v.get(t); if (o) dot += w * o; }
  return dot / (a.norm * b.norm);
}

/** Turn a free-text question into a compact keyword query. */
export function planQuery(question) {
  const raw = (question || "").toLowerCase().match(/[a-z0-9][a-z0-9\-+]*/g) || [];
  const keep = [];
  for (const w of raw) {
    if (w.length < 2 || STOP_BASE.has(w) || FILLER_QUERY.has(w)) continue;
    if (!keep.includes(w)) keep.push(w);
  }
  const terms = keep.slice(0, 8);
  return { terms, cleaned: terms.join(" "), display: terms.join(" "), stems: new Set(terms.map(stem)) };
}

/* --------------------------- per-paper extraction ------------------------- */

const CONTRIB_RE = /\b(we|this (?:paper|study|work|article|research|review|survey)|our|the authors?)\b[^.]{0,80}\b(propos\w*|present\w*|introduc\w*|develop\w*|show\w*|demonstrat\w*|investigat\w*|study|studies|evaluat\w*|review\w*|survey\w*|analy[sz]\w*|design\w*|explor\w*|examin\w*|conduct\w*|report\w*|find|found)\b/i;
const METHOD_RE = /\b(based on|using|uses|employ\w*|leverag\w*|utili[sz]\w*|framework|architecture|approach|method|methodolog\w*|model|algorithm|network|technique|pipeline|trained|training|fine-tun\w*|combin\w*|integrat\w*)\b/i;
const LIMIT_RE = /\b(however|limitation\w*|limited|limits?|fails?|failure|struggles?|challeng\w*|lacks?|lacking|drawbacks?|unclear|remains? (?:an? )?(?:open|unclear|unexplored|challenging|difficult)|not (?:yet )?(?:well|fully|been|addressed)|insufficient|poor(?:ly)?|degrad\w+|vulnerab\w+|suffers?|biased?|scarc\w+|future (?:work|research)|unexplored|under-?explored|little (?:is known|attention)|susceptible|inconsisten\w*)\b/i;

const METRIC_NAMES = "accuracy|precision|recall|f1(?:[- ]score)?|f-measure|auc|auroc|roc[- ]auc|eer|bleu|rouge(?:-[l12])?|miou|iou|rmse|mae|mse|perplexity|sensitivity|specificity|error rate|wer|cer|top-1|top-5|mean average precision|r2|r²";
const METRIC_A = new RegExp(`(\\d{1,3}(?:\\.\\d+)?\\s?%)\\s+(?:of\\s+)?(${METRIC_NAMES})\\b`, "gi");
const METRIC_B = new RegExp(`\\b(${METRIC_NAMES})\\b\\s*(?:score\\s+)?(?:of|=|:|reach(?:ed|es|ing)?|achiev(?:ed|es|ing)|is|was|up to|to|at)?\\s*(\\d{1,3}(?:\\.\\d+)?\\s?%|0?\\.\\d{2,4}|\\d{1,2}\\.\\d+)`, "gi");

const METRIC_TEST = new RegExp(METRIC_B.source, "i");

function extractMetrics(text) {
  const found = [];
  const fmt = (n) => (/^(auc|auroc|eer|iou|miou|bleu|wer|cer|rmse|mae|mse)/i.test(n) ? n.toUpperCase() : n.toLowerCase());
  let m;
  METRIC_A.lastIndex = 0; METRIC_B.lastIndex = 0;
  while ((m = METRIC_A.exec(text))) found.push(`${fmt(m[2])} ${m[1].replace(/\s/g, "")}`);
  while ((m = METRIC_B.exec(text))) found.push(`${fmt(m[1])} ${m[2].replace(/\s/g, "")}`);
  return uniq(found).slice(0, 3);
}

const GENERIC_CAP = new Set("the a an this that our new large public existing several standard common open recent popular widely benchmark benchmarks dataset datasets various multiple different both two three four five six seven eight nine ten these those other many some all most each training test testing validation evaluation large-scale synthetic real labeled labelled annotated publicly experimental proposed available".split(" "));
const CAP = "[A-Z][A-Za-z0-9\\-+]*";
const DS_A = new RegExp(`\\b((?:${CAP})(?:\\s${CAP}){0,2})\\s+(?:dataset|datasets|corpus|corpora|benchmark|benchmarks|database|databases)\\b`, "g");
const DS_B = new RegExp(`\\b(?:[Ee]valuat\\w*|[Tt]est\\w*|[Tt]rain\\w*|[Ee]xperiment\\w*|[Bb]enchmark\\w*|[Rr]esults?)\\s+(?:on|using|over|across|with)\\s+((?:the\\s+)?${CAP}(?:\\s${CAP}){0,2}(?:(?:,\\s*(?:and\\s+)?|\\s+and\\s+)${CAP}(?:\\s${CAP}){0,2})*)`, "g");

function cleanDatasetName(raw, strict = false) {
  let words = raw.replace(/[.,;:]+$/, "").split(/\s+/).filter(Boolean);
  while (words.length && GENERIC_CAP.has(words[0].toLowerCase())) words.shift();
  while (words.length && GENERIC_CAP.has(words[words.length - 1].toLowerCase())) words.pop();
  if (!words.length) return null;
  const name = words.join(" ");
  if (name.length < 3 || name.length > 40) return null;
  if (STOP_BASE.has(name.toLowerCase())) return null;
  if (!/[A-Z]/.test(name)) return null;
  if (strict && !(/[A-Z].*[A-Z]/.test(name) || /\d/.test(name) || words.length > 1)) return null;
  // single plain capitalised English word (e.g. "Experiments") is not a dataset name
  if (words.length === 1 && /^[A-Z][a-z]+$/.test(name) && name.length < 6) return null;
  return name;
}

function extractDatasets(text) {
  const out = [];
  let m;
  DS_A.lastIndex = 0; DS_B.lastIndex = 0;
  while ((m = DS_A.exec(text))) { const n = cleanDatasetName(m[1]); if (n) out.push(n); }
  while ((m = DS_B.exec(text))) {
    for (const part of m[1].split(/,\s*(?:and\s+)?|\s+and\s+/)) {
      const n = cleanDatasetName(part.replace(/^the\s+/i, ""), true);
      if (n) out.push(n);
    }
  }
  const seen = new Set();
  return out.filter((n) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
}

function authorInitials(name) {
  const parts = name.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length === 1) return name;
  const last = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map((p) => p.split("-").map((x) => (x[0] ? x[0].toUpperCase() + "." : "")).join("-"));
  return `${initials.join(" ")} ${last}`;
}

const lastName = (name) => name.trim().split(/\s+/).slice(-1)[0];

function shortAuthors(list) {
  if (!list.length) return "Unknown authors";
  const f = list.map(authorInitials);
  return f.length > 3 ? `${f[0]} et al.` : f.join(", ");
}

/** "Alvarez et al." / "Chen & Petrov" / "Okoye" */
export function authorLabel(p) {
  const l = p.authorList || [];
  if (!l.length) return "Unknown";
  if (l.length === 1) return lastName(l[0]);
  if (l.length === 2) return `${lastName(l[0])} & ${lastName(l[1])}`;
  return `${lastName(l[0])} et al.`;
}

function summarize(sentences, corpusInfo, queryStems) {
  if (!sentences.length) return [];
  const scored = sentences.map((s, i) => {
    const toks = tokenStream(s).filter(Boolean);
    if (toks.length < 6) return { s, i, score: -1 };
    let sum = 0;
    for (const t of toks) sum += corpusInfo.idf(t.s) * (queryStems.has(t.s) ? 1.4 : 1);
    let score = sum / Math.sqrt(toks.length);
    if (CONTRIB_RE.test(s)) score *= 1.25;
    if (/\d/.test(s) && METRIC_TEST.test(s)) score *= 1.1;
    if (i === 0) score *= 1.1;
    if (LIMIT_RE.test(s) && i === sentences.length - 1) score *= 1.05;
    return { s, i, score };
  });
  const top = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).sort((a, b) => a.i - b.i);
  return top.map((x) => x.s);
}

function analyzePaper(p, corpus, queryStems) {
  const text = p.abstractText;
  const sentences = splitSentences(text);
  const summarySentences = summarize(sentences, corpus, queryStems);
  const contribution =
    sentences.find((s) => CONTRIB_RE.test(s)) || summarySentences[0] || sentences[0] || "";
  const methodSentence = sentences.find((s) => METHOD_RE.test(s) && s !== contribution) || "";
  const limitSentences = sentences.filter((s) => LIMIT_RE.test(s) && s !== contribution);
  const datasets = extractDatasets(text);
  const metrics = extractMetrics(text);
  return {
    abstract: clip(summarySentences.join(" ") || clip(text, 420), 460),
    contribution: clip(contribution, 280) || "Not stated in abstract.",
    methodology: clip(methodSentence, 280) || "Not specified in abstract.",
    dataset: datasets.length ? datasets.join(", ") : "Not stated in abstract",
    datasetNames: datasets,
    metrics: metrics.length ? metrics.join(", ") : "No numeric results in abstract",
    hasMetrics: metrics.length > 0,
    limitations: limitSentences.length ? clip(limitSentences[0], 280) : "No limitations stated in abstract.",
    limitSentences: limitSentences.map((s) => clip(s, 260)),
  };
}

/* ------------------------------ data sources ------------------------------ */

function mapOpenAlex(w) {
  const doi = (w.doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  const loc = w.primary_location || {};
  return {
    doi,
    title: w.display_name || w.title || "",
    year: w.publication_year || null,
    citations: w.cited_by_count || 0,
    authorList: (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean),
    venue: loc.source?.display_name || (w.type === "preprint" ? "Preprint" : "Venue not listed"),
    url: loc.landing_page_url || (doi ? `https://doi.org/${doi}` : w.id),
    oa: !!w.open_access?.is_oa,
    abstractText: cleanAbstract(invertedToText(w.abstract_inverted_index)),
    oaScore: typeof w.relevance_score === "number" ? w.relevance_score : null,
    source: "OpenAlex",
  };
}

function mapS2(p) {
  const doi = p.externalIds?.DOI || "";
  return {
    doi,
    title: p.title || "",
    year: p.year || null,
    citations: p.citationCount || 0,
    authorList: (p.authors || []).map((a) => a.name).filter(Boolean),
    venue: p.venue || "Venue not listed",
    url: (doi && `https://doi.org/${doi}`) || p.openAccessPdf?.url || p.url || "",
    oa: !!p.openAccessPdf?.url,
    abstractText: cleanAbstract(p.abstract),
    oaScore: null,
    source: "Semantic Scholar",
  };
}

async function fetchOpenAlex(query, signal) {
  const params = new URLSearchParams({ search: query, filter: "has_abstract:true", per_page: "50" });
  const data = await getJSON(`${OPENALEX}/works?${params}`, { signal, retries: 1 });
  return { total: data.meta?.count ?? (data.results || []).length, papers: (data.results || []).map(mapOpenAlex) };
}

async function fetchS2(query, signal) {
  const params = new URLSearchParams({
    query, limit: "30",
    fields: "title,abstract,year,venue,citationCount,authors,externalIds,openAccessPdf,url",
  });
  const data = await getJSON(`${S2}/paper/search?${params}`, { signal, timeout: 12000 });
  return { total: data.total ?? (data.data || []).length, papers: (data.data || []).map(mapS2) };
}

function mergePapers(lists) {
  const byKey = new Map();
  for (const list of lists) {
    for (const p of list) {
      if (!p.title || p.abstractText.length < 80) continue;
      const key = (p.doi && p.doi.toLowerCase()) || normTitle(p.title);
      const alt = normTitle(p.title);
      const existing = byKey.get(key) || byKey.get(alt);
      if (existing) {
        existing.citations = Math.max(existing.citations, p.citations);
        existing.oa = existing.oa || p.oa;
        if (!existing.source.includes(p.source)) existing.source += ` + ${p.source}`;
        if (existing.venue === "Venue not listed" && p.venue) existing.venue = p.venue;
        if (!existing.authorList.length) existing.authorList = p.authorList;
      } else {
        byKey.set(key, p);
        byKey.set(alt, p);
      }
    }
  }
  return uniq([...byKey.values()]);
}

async function fetchTrends(query, signal) {
  const params = new URLSearchParams({ search: query, group_by: "publication_year" });
  const data = await getJSON(`${OPENALEX}/works?${params}`, { signal, retries: 1 });
  const thisYear = new Date().getFullYear();
  const counts = new Map();
  for (const g of data.group_by || []) {
    const y = parseInt(g.key, 10);
    if (y >= thisYear - 10 && y <= thisYear) counts.set(y, g.count);
  }
  if (!counts.size) throw new Error("No yearly data");
  const data2 = [];
  for (let y = thisYear - 10; y <= thisYear; y++) data2.push({ year: y, papers: counts.get(y) || 0, partial: y === thisYear });
  return data2;
}

function tagValue(tags, prefix) {
  return (tags || []).filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));
}

async function fetchHFDatasets(terms, signal) {
  const attempts = [terms.slice(0, 3).join(" "), terms.slice(0, 2).join(" "), terms[0]].filter(Boolean);
  for (const q of uniq(attempts)) {
    const params = new URLSearchParams({ search: q, limit: "8", sort: "downloads", direction: "-1" });
    const data = await getJSON(`${HF}/datasets?${params}`, { signal, timeout: 12000 });
    if (Array.isArray(data) && data.length) {
      return data.map((d) => {
        const tags = d.tags || [];
        const tasks = tagValue(tags, "task_categories:").map((t) => t.replace(/-/g, " "));
        const modal = tagValue(tags, "modality:");
        const size = tagValue(tags, "size_categories:")[0];
        const lic = tagValue(tags, "license:")[0];
        return {
          name: d.id,
          domain: tasks.length ? tasks.slice(0, 3).join(", ") : "Hugging Face dataset",
          size: size ? `${size} samples` : "Size not listed",
          modalities: modal.length ? modal.join(", ") : tasks.length ? "See tasks" : "Not listed",
          license: lic ? lic.toUpperCase() : "Not specified",
          source: "Hugging Face",
          url: `https://huggingface.co/datasets/${d.id}`,
          downloads: d.downloads || 0,
        };
      });
    }
  }
  return [];
}

/* ------------------------------ analysis steps ---------------------------- */

function rankPapers(candidates, plan) {
  const corpus = buildCorpus(candidates.map((p, i) => ({ id: i, text: `${p.title}. ${p.title}. ${p.abstractText}` })));
  const vecs = corpus.parsed.map((p) => corpus.vec(p));
  const qUni = new Map();
  for (const t of tokenStream(plan.cleaned, 2).filter(Boolean)) qUni.set(t.s, (qUni.get(t.s) || 0) + 1);
  const qvec = corpus.vec({ uni: qUni });
  const cos = vecs.map((v) => cosine(qvec, v));
  const maxCos = Math.max(...cos, 1e-9);
  const maxOA = Math.max(...candidates.map((p) => p.oaScore || 0), 0);
  candidates.forEach((p, i) => {
    const c = cos[i] / maxCos;
    const rel = maxOA > 0 && p.oaScore != null ? 0.5 * c + 0.5 * (p.oaScore / maxOA) : c;
    p.relevance = Math.max(1, Math.min(100, Math.round(rel * 100)));
  });
  const order = candidates
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.relevance - a.p.relevance || b.p.citations - a.p.citations);
  return { corpus, order };
}

function topTerms(docIdx, corpus, { n = 6, exclude = new Set(), minDf = 2 } = {}) {
  const df = new Map();
  const score = new Map();
  for (const idx of docIdx) {
    const doc = corpus.parsed[idx];
    for (const [t, c] of doc.uni) { df.set(t, (df.get(t) || 0) + 1); score.set(t, (score.get(t) || 0) + (1 + Math.log(c)) * corpus.idf(t)); }
    for (const [t, c] of doc.bi) { df.set(t, (df.get(t) || 0) + 1); score.set(t, (score.get(t) || 0) + (1 + Math.log(c)) * corpus.idf(t) * 1.35); }
  }
  const ranked = [...score.entries()]
    .filter(([t]) => (df.get(t) || 0) >= minDf && !t.split(" ").some((s) => exclude.has(s)))
    .sort((a, b) => b[1] - a[1]);
  const chosen = [];
  for (const [t, s] of ranked) {
    if (chosen.length >= n) break;
    if (!t.includes(" ") && chosen.some((c) => c.term.split(" ").includes(t))) continue;
    if (t.includes(" ")) {
      // drop unigrams already chosen that this bigram subsumes
      for (let i = chosen.length - 1; i >= 0; i--) if (!chosen[i].term.includes(" ") && t.split(" ").includes(chosen[i].term)) chosen.splice(i, 1);
    }
    chosen.push({ term: t, df: df.get(t), score: s });
  }
  return chosen.slice(0, n);
}

function findGaps(papers, corpus, plan) {
  const N = papers.length;
  const termPapers = new Map();
  for (const p of papers) {
    const stream = tokenStream(p.limitSentences.join(" "));
    const seen = new Set();
    for (let i = 0; i < stream.length; i++) {
      const t = stream[i];
      if (!t) continue;
      seen.add(t.s);
      const n = stream[i + 1];
      if (n && n.s !== t.s) seen.add(`${t.s} ${n.s}`);
    }
    for (const term of seen) {
      if (!termPapers.has(term)) termPapers.set(term, new Set());
      termPapers.get(term).add(p.id);
    }
  }
  const bad = (s) => plan.stems.has(s) || LIMIT_STOP.has(s) || s.length < 3;
  const candidates = [...termPapers.entries()]
    .filter(([t, set]) => set.size >= 2 && !t.split(" ").some(bad))
    .sort((a, b) => b[1].size - a[1].size || (b[0].includes(" ") ? 1 : 0) - (a[0].includes(" ") ? 1 : 0) || corpus.idf(b[0]) - corpus.idf(a[0]));

  const gaps = [];
  const chosenTerms = [];
  for (const [term, set] of candidates) {
    if (gaps.length >= 4) break;
    if (chosenTerms.some((c) => c.split(" ").includes(term) || term.split(" ").includes(c))) continue;
    const dup = gaps.some((g) => {
      const inter = g.papers.filter((id) => set.has(id)).length;
      return inter / (g.papers.length + set.size - inter) >= 0.8;
    });
    if (dup) continue;
    chosenTerms.push(term);
    const ids = [...set];
    const stems = term.split(" ");
    const examples = ids.slice(0, 2).map((id) => {
      const p = papers.find((x) => x.id === id);
      const sent = p.limitSentences.find((s) => stems.every((st) => tokenStream(s).some((t) => t && t.s === st))) || p.limitSentences[0];
      return { p, sent };
    });
    const label = corpus.display(term);
    gaps.push({
      id: `g${gaps.length + 1}`,
      term: label,
      title: `Open issues around “${label}”`,
      body:
        `${ids.length} of ${N} selected papers describe limitations or open problems related to “${label}”. ` +
        examples.map((e) => `${authorLabel(e.p)} (${e.p.year}): “${clip(e.sent, 210)}”`).join(" "),
      why:
        `The issue recurs across ${ids.length} independent papers, which suggests a shared obstacle rather than a one-off weakness — ` +
        `results on “${label}” may not transfer reliably until it is addressed.`,
      direction:
        `Design experiments, benchmarks or methods that explicitly target “${label}”, and report results separately for it so progress can be compared across studies.`,
      confidence: ids.length >= 3 ? "High" : "Medium",
      papers: ids,
    });
  }
  if (gaps.length < 3) {
    const inGap = new Set(gaps.flatMap((g) => g.papers));
    const singles = papers
      .filter((p) => p.limitSentences.length)
      .sort((a, b) => (inGap.has(a.id) - inGap.has(b.id)) || b.citations - a.citations);
    for (const p of singles) {
      if (gaps.length >= 4) break;
      const sent = p.limitSentences[0];
      const stream = tokenStream(sent).filter((t) => t && !bad(t.s));
      const key = stream.sort((a, b) => corpus.idf(b.s) - corpus.idf(a.s))[0];
      const label = key ? corpus.display(key.s) : "this limitation";
      gaps.push({
        id: `g${gaps.length + 1}`,
        term: label,
        title: `Limitation reported by ${authorLabel(p)} (${p.year})`,
        body: `${authorLabel(p)} (${p.year}): “${clip(sent, 240)}”`,
        why: "Stated by a single paper in this set, so it is a lead worth checking rather than an established pattern.",
        direction: `Check whether other work addresses “${label}”, and if not, test the claim on additional data or settings.`,
        confidence: "Low",
        papers: [p.id],
      });
    }
  }
  return gaps;
}

function emergingTopics(candidates, corpus, plan) {
  const years = candidates.map((p) => p.year).filter(Boolean);
  const idxs = candidates.map((_, i) => i);
  const fallback = () =>
    topTerms(idxs, corpus, { n: 5, exclude: plan.stems, minDf: 3 }).map((t) => ({
      name: corpus.display(t.term), trend: "steady",
      evidence: `appears in ${Math.round((100 * t.df) / candidates.length)}% of retrieved papers`,
    }));
  if (years.length < 8) return { topics: fallback(), basis: "too few dated papers to measure change" };
  const latest = Math.max(...years);
  const cutoff = latest - 2;
  const recent = idxs.filter((i) => candidates[i].year >= cutoff);
  const older = idxs.filter((i) => candidates[i].year < cutoff);
  if (recent.length < 4 || older.length < 4) return { topics: fallback(), basis: "too few papers in one period to measure change" };
  const cnt = (group, term) => group.reduce((a, i) => a + ((term.includes(" ") ? corpus.parsed[i].bi : corpus.parsed[i].uni).has(term) ? 1 : 0), 0);
  const terms = new Set();
  for (const i of idxs) { for (const t of corpus.parsed[i].uni.keys()) terms.add(t); for (const t of corpus.parsed[i].bi.keys()) terms.add(t); }
  const rows = [];
  for (const t of terms) {
    if (t.split(" ").some((s) => plan.stems.has(s))) continue;
    const dfT = (t.includes(" ") ? corpus.dfBi : corpus.dfUni).get(t) || 0;
    if (dfT < 4) continue;
    const sR = cnt(recent, t) / recent.length, sO = cnt(older, t) / older.length;
    rows.push({ t, sR, sO, delta: sR - sO, ratio: (sR + 0.02) / (sO + 0.02) });
  }
  const dedupe = (list) => {
    const out = [];
    for (const r of list) {
      if (!r.t.includes(" ") && out.some((o) => o.t.split(" ").includes(r.t))) continue;
      out.push(r);
    }
    return out;
  };
  const rising = dedupe(rows.filter((r) => r.delta >= 0.12 && r.ratio >= 1.6).sort((a, b) => b.delta - a.delta || (b.t.includes(" ") ? 1 : 0) - (a.t.includes(" ") ? 1 : 0))).slice(0, 4);
  const falling = dedupe(rows.filter((r) => r.delta <= -0.12 && r.ratio <= 0.6).sort((a, b) => a.delta - b.delta)).slice(0, 2);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const topics = [
    ...rising.map((r) => ({ name: corpus.display(r.t), trend: "up", evidence: `in ${pct(r.sR)} of ${cutoff}–${latest} papers vs ${pct(r.sO)} earlier` })),
    ...falling.map((r) => ({ name: corpus.display(r.t), trend: "down", evidence: `in ${pct(r.sR)} of ${cutoff}–${latest} papers vs ${pct(r.sO)} earlier` })),
  ];
  if (!topics.length) return { topics: fallback(), basis: "no term changed enough between periods to call a trend" };
  return { topics, basis: `${recent.length} papers from ${cutoff}–${latest} compared with ${older.length} earlier papers` };
}

function trendNote(trend, emerging) {
  const thisYear = new Date().getFullYear();
  const complete = (trend.data || []).filter((d) => d.year < thisYear && d.papers > 0);
  const cur = (trend.data || []).find((d) => d.year === thisYear);
  let s = "";
  if (trend.sampleOnly) {
    s = "Yearly publication counts could not be loaded, so the chart shows only the retrieved sample by year, which says nothing about total publication volume.";
  } else if (complete.length >= 3) {
    const first = complete[0], last = complete[complete.length - 1];
    const peak = complete.reduce((a, b) => (b.papers > a.papers ? b : a));
    const ratio = last.papers / Math.max(first.papers, 1);
    const verb = ratio >= 1.15 ? "grew" : ratio <= 0.87 ? "fell" : "stayed roughly flat";
    s += `Indexed publications on this topic ${verb} from ${first.papers.toLocaleString()} in ${first.year} to ${last.papers.toLocaleString()} in ${last.year}` +
      (ratio >= 1.15 || ratio <= 0.87 ? ` (${ratio.toFixed(1)}×)` : "") + `; the busiest complete year was ${peak.year}.`;
    if (cur) s += ` ${thisYear} has ${cur.papers.toLocaleString()} so far (year to date, so not comparable).`;
  } else s = "Too few complete years of data to describe a publication trend.";
  const up = emerging.topics.filter((t) => t.trend === "up").map((t) => t.name);
  if (up.length) s += ` In the retrieved sample, ${up.join(", ")} appear more often in recent papers than in older ones.`;
  return s;
}

function buildGraph(papers, datasets, corpus, plan, question) {
  const top = papers.slice(0, 6);
  const concepts = topTerms(papers.map((p) => p._idx), corpus, { n: 4, exclude: plan.stems, minDf: 2 });
  const dsNames = datasets.filter((d) => d.related.length).slice(0, 3);
  const cx = 300, cy = 200;
  const nodes = [{ id: "q", label: clip(plan.display || question, 24), type: "area", x: cx, y: cy }];
  const edges = [];
  const pAngle = new Map();
  top.forEach((p, i) => {
    const a = (i / top.length) * Math.PI * 2 - Math.PI / 2;
    pAngle.set(p.id, a);
    nodes.push({ id: p.id, label: `${authorLabel(p).replace(/ et al\./, "")} ${p.year}`, type: "paper", x: cx + 120 * Math.cos(a), y: cy + 80 * Math.sin(a) });
    edges.push(["q", p.id]);
  });
  const outer = [];
  concepts.forEach((c, i) => {
    const linked = top.filter((p) => (c.term.includes(" ") ? corpus.parsed[p._idx].bi : corpus.parsed[p._idx].uni).has(c.term));
    if (!linked.length) return;
    outer.push({ id: `c${i}`, label: clip(corpus.display(c.term), 20), type: "concept", linked: linked.map((p) => p.id) });
  });
  dsNames.forEach((d, i) => {
    const linked = d.related.filter((id) => pAngle.has(id));
    if (!linked.length) return;
    outer.push({ id: `d${i}`, label: clip(d.name.split("/").pop(), 20), type: "dataset", linked });
  });
  for (const o of outer) {
    const angs = o.linked.map((id) => pAngle.get(id));
    o.angle = Math.atan2(angs.reduce((a, x) => a + Math.sin(x), 0), angs.reduce((a, x) => a + Math.cos(x), 0));
  }
  outer.sort((a, b) => a.angle - b.angle);
  // enforce minimum angular spacing
  const minGap = 0.62;
  for (let i = 1; i < outer.length; i++) if (outer[i].angle - outer[i - 1].angle < minGap) outer[i].angle = outer[i - 1].angle + minGap;
  for (const o of outer) {
    nodes.push({ id: o.id, label: o.label, type: o.type, x: cx + 235 * Math.cos(o.angle), y: cy + 152 * Math.sin(o.angle) });
    for (const id of o.linked) edges.push([id, o.id]);
  }
  return { nodes, edges };
}

/* ------------------------------ citations --------------------------------- */

export const CITATION_FORMAT_NAMES = ["IEEE", "APA", "MLA", "BibTeX"];

const ieeeAuthors = (l) => {
  const f = l.map(authorInitials);
  if (!f.length) return "Unknown author";
  if (f.length > 6) return `${f[0]} et al.`;
  if (f.length === 1) return f[0];
  if (f.length === 2) return `${f[0]} and ${f[1]}`;
  return `${f.slice(0, -1).join(", ")}, and ${f[f.length - 1]}`;
};
const apaName = (n) => {
  const parts = n.trim().split(/\s+/);
  if (parts.length === 1) return n;
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).map((p) => p[0].toUpperCase() + ".").join(" ")}`;
};
const apaAuthors = (l) => {
  if (!l.length) return "Unknown author";
  const f = l.slice(0, 6).map(apaName);
  const more = l.length > 6 ? ", et al." : "";
  if (f.length === 1) return f[0] + more;
  return `${f.slice(0, -1).join(", ")}${more ? "," : ", &"} ${f[f.length - 1]}${more}`;
};
const mlaAuthors = (l) => {
  if (!l.length) return "Unknown author";
  const first = l[0].trim().split(/\s+/);
  const inv = first.length > 1 ? `${first[first.length - 1]}, ${first.slice(0, -1).join(" ")}` : l[0];
  if (l.length === 1) return inv;
  if (l.length === 2) return `${inv}, and ${l[1]}`;
  return `${inv}, et al.`;
};
const bibEsc = (s) => s.replace(/([&%$#_])/g, "\\$1");

export function formatCitation(fmt, p, i = 0) {
  const l = p.authorList || [];
  const doi = p.doi ? ` https://doi.org/${p.doi}` : p.url ? ` ${p.url}` : "";
  switch (fmt) {
    case "IEEE":
      return `[${i + 1}] ${ieeeAuthors(l)}, "${p.title}," ${p.venue}, ${p.year}.${doi}`;
    case "APA":
      return `${apaAuthors(l)} (${p.year}). ${p.title}. ${p.venue}.${doi}`;
    case "MLA":
      return `${mlaAuthors(l).replace(/\.$/, "")}. "${p.title}." ${p.venue}, ${p.year}.${doi}`;
    case "BibTeX": {
      const key = `${(l[0] ? lastName(l[0]) : "anon").toLowerCase().replace(/[^a-z0-9]/g, "")}${p.year}${(p.title.match(/[A-Za-z]{4,}/) || ["paper"])[0].toLowerCase()}`;
      return `@article{${key},\n  title={${bibEsc(p.title)}},\n  author={${l.map(bibEsc).join(" and ")}},\n  year={${p.year}},\n  journal={${bibEsc(p.venue)}}${p.doi ? `,\n  doi={${p.doi}}` : ""}\n}`;
    }
    default:
      return "";
  }
}

/* -------------------------------- report ---------------------------------- */

function buildReport(r) {
  const { papers, gaps, datasets, stats, plan, areas, comparisonSummary, trend } = r;
  const topic = plan.display;
  const range = stats.yearRange;
  const topCited = [...papers].sort((a, b) => b.citations - a.citations)[0];
  const withMetrics = papers.filter((p) => p.hasMetrics);
  const dsNames = datasets.slice(0, 5).map((d) => d.name);
  const sec = [];
  sec.push({ id: "abstract", title: "Abstract", body:
    `This report synthesizes ${papers.length} papers on “${topic}”, selected from ${stats.candidates} retrieved works with abstracts (${stats.matching.toLocaleString()} matching works indexed). ` +
    `Papers span ${range}. Recurring concepts are ${areas.slice(0, 4).join(", ") || "not clearly distinguishable"}. ` +
    (gaps.length ? `${gaps.length} recurring limitation${gaps.length > 1 ? "s were" : " was"} identified in the abstracts.` : "No explicit limitations were stated in the retrieved abstracts.") });
  sec.push({ id: "intro", title: "1. Introduction", body:
    `This report surveys recent literature on “${topic}”. Works were retrieved from ${stats.sources.join(" and ")} using the keyword query “${plan.cleaned}”, ranked by TF-IDF similarity to the query combined with the source's own relevance score, and the top ${papers.length} were analyzed.` });
  sec.push({ id: "background", title: "2. Background", body:
    areas.length ? `Across the selected papers, the most frequent concepts are ${areas.join(", ")}. Publication years: ${range}.` : `Publication years: ${range}.` });
  sec.push({ id: "lit", title: "3. Literature Review", body:
    papers.slice(0, 6).map((p) => `${authorLabel(p)} (${p.year}) — ${p.contribution}`).join(" ") });
  sec.push({ id: "method", title: "4. Methodology Comparison", body: `${comparisonSummary} See the Comparison tab for the full table.` });
  sec.push({ id: "findings", title: "5. Key Findings", body: withMetrics.length
    ? withMetrics.slice(0, 4).map((p) => `${authorLabel(p)} (${p.year}) report ${p.metrics}.`).join(" ") + ` ${papers.length - withMetrics.length} of ${papers.length} abstracts report no numeric results.`
    : "None of the selected abstracts report numeric results, so findings are qualitative." });
  sec.push({ id: "gaps", title: "6. Research Gaps", body: gaps.length
    ? `${gaps.length} gap${gaps.length > 1 ? "s were" : " was"} derived from limitations stated in the abstracts: ${gaps.map((g) => g.title).join("; ")}. See the Research Gaps tab for the supporting quotes.`
    : "No limitations were explicitly stated in the retrieved abstracts, so no data-driven gaps are reported." });
  sec.push({ id: "datasets", title: "7. Datasets", body: dsNames.length
    ? `Datasets surfaced for this topic include ${dsNames.join(", ")}. Entries marked “Mentioned in abstracts” were named by the selected papers; others come from a Hugging Face search.`
    : "No datasets were identified for this topic." });
  sec.push({ id: "trends", title: "8. Emerging Research Trends", body: trend.note });
  sec.push({ id: "discussion", title: "9. Discussion", body:
    `The most-cited selected paper is “${topCited.title}” (${topCited.citations.toLocaleString()} citations). ` +
    `This synthesis is generated automatically from titles and abstracts only: full-text details, experimental setups and negative results are not captured. Relevance scores are relative to the best match in the retrieved set, and citation counts reflect the sources at query time.` });
  sec.push({ id: "future", title: "10. Future Research Directions", body: gaps.length
    ? gaps.map((g) => g.direction).join(" ")
    : "Read the selected papers in full to identify limitations and open problems that abstracts do not state." });
  sec.push({ id: "conclusion", title: "11. Conclusion", body:
    `The literature on “${topic}” in this sample is led by ${areas.slice(0, 3).join(", ") || "a diverse set of themes"}. ` +
    (gaps.length ? `The recurring limitations summarized above indicate where further work is most evidenced.` : `Further full-text analysis is needed to establish evidenced gaps.`) });
  return { title: `Literature Synthesis: ${topic.replace(/\b\w/g, (c) => c.toUpperCase())}`, sections: sec };
}

export function reportToMarkdown(res) {
  const refs = res.papers.map((p, i) => formatCitation("IEEE", p, i)).join("\n");
  return `# ${res.report.title}\n\n` + res.report.sections.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n") + `\n\n## References\n\n${refs}\n`;
}

export function reportToHTML(res) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<html><head><meta charset="utf-8"><title>${esc(res.report.title)}</title></head><body style="font-family:Calibri,Arial,sans-serif;line-height:1.5">` +
    `<h1>${esc(res.report.title)}</h1>` +
    res.report.sections.map((s) => `<h2>${esc(s.title)}</h2><p>${esc(s.body)}</p>`).join("") +
    `<h2>References</h2>` + res.papers.map((p, i) => `<p>${esc(formatCitation("IEEE", p, i))}</p>`).join("") +
    `</body></html>`;
}

/* --------------------------------- pipeline -------------------------------- */

const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));

export async function runResearch(question, { onAgent = () => {}, signal } = {}) {
  const trace = ["User research question received"];
  const results = { question };
  const run = async (key, fn) => {
    onAgent(key, "running");
    const t0 = Date.now();
    const ui = await fn();
    const wait = Math.max(0, 350 - (Date.now() - t0));
    if (wait) await sleep(wait, signal);
    onAgent(key, "done", ui);
  };

  let plan, trendsP, datasetsP, searchOut, ranked, selected, corpusSel;

  await run("coordinator", async () => {
    plan = planQuery(question);
    if (!plan.terms.length) throw new Error("Please enter a more specific research topic (a few meaningful keywords).");
    results.plan = plan;
    trendsP = settle(fetchTrends(plan.cleaned, signal));
    datasetsP = settle(fetchHFDatasets(plan.terms, signal));
    trace.push(`Coordinator Agent reduced the question to the keyword query “${plan.cleaned}” and planned a 10-step workflow`);
    return { result: `Workflow planned for “${plan.cleaned}” across OpenAlex, Semantic Scholar & Hugging Face.`, sources: null };
  });

  await run("search", async () => {
    const [oa, s2] = await Promise.all([settle(fetchOpenAlex(plan.cleaned, signal)), settle(fetchS2(plan.cleaned, signal))]);
    if (signal?.aborted) throw abortError();
    if (!oa.ok && !s2.ok) {
      const e = new Error("Could not reach the paper databases (OpenAlex and Semantic Scholar). Check your internet connection and try again.");
      e.code = "network";
      throw e;
    }
    const lists = [oa.ok ? oa.v.papers : [], s2.ok ? s2.v.papers : []];
    const retrievedRaw = lists[0].length + lists[1].length;
    const candidates = mergePapers(lists);
    if (!candidates.length) throw new Error(`No papers with abstracts were found for “${question}”. Try different or broader keywords.`);
    const sources = [oa.ok && "OpenAlex", s2.ok && "Semantic Scholar"].filter(Boolean);
    searchOut = { candidates, sources, matching: oa.ok ? oa.v.total : s2.v.total, retrievedRaw };
    trace.push(`Search Agent queried ${sources.join(" and ")}${s2.ok ? "" : " (Semantic Scholar was unavailable or rate-limited)"}; ${retrievedRaw} records returned`);
    trace.push(`${candidates.length} unique papers with usable abstracts after de-duplication`);
    return { result: `${candidates.length} papers with abstracts found (${searchOut.matching.toLocaleString()} matches indexed).`, sources: candidates.length };
  });

  await run("summary", async () => {
    const { candidates } = searchOut;
    ranked = rankPapers(candidates, plan);
    const K = Math.min(12, candidates.length);
    selected = ranked.order.slice(0, K).map(({ p, i }, n) => {
      const a = analyzePaper(p, ranked.corpus, plan.stems);
      return {
        id: `p${n + 1}`, _idx: i,
        title: p.title, authorList: p.authorList, authors: shortAuthors(p.authorList),
        year: p.year || "n.d.", venue: p.venue, doi: p.doi, url: p.url,
        relevance: p.relevance, citations: p.citations, source: p.source, oa: p.oa,
        fullAbstract: p.abstractText, ...a,
      };
    });
    corpusSel = ranked.corpus;
    trace.push(`Ranking: TF-IDF cosine similarity to the query blended with the source relevance score; top ${K} selected`);
    trace.push("Summary Agent produced extractive summaries and extracted contribution, method, metrics, datasets and limitations from each abstract");
    return { result: `${K} papers summarized from their abstracts.`, sources: K };
  });

  await run("comparison", async () => {
    const withM = selected.filter((p) => p.hasMetrics);
    const byCit = [...selected].sort((a, b) => b.citations - a.citations)[0];
    const byYear = [...selected].filter((p) => typeof p.year === "number").sort((a, b) => b.year - a.year)[0];
    const themes = topTerms(selected.map((p) => p._idx), corpusSel, { n: 4, exclude: plan.stems, minDf: 2 }).map((t) => corpusSel.display(t.term));
    results.comparisonSummary =
      `Of the ${selected.length} compared papers, ${withM.length} report numeric results in their abstracts` +
      (withM.length ? ` (e.g. ${authorLabel(withM[0])}: ${withM[0].metrics})` : "") + `. ` +
      `The most-cited is “${clip(byCit.title, 90)}” (${byCit.citations.toLocaleString()} citations)` +
      (byYear ? ` and the newest is “${clip(byYear.title, 90)}” (${byYear.year})` : "") + `. ` +
      (themes.length ? `Shared themes: ${themes.join(", ")}. ` : "") +
      (selected.length - withM.length > 0 ? `${selected.length - withM.length} abstracts report no numbers, which limits direct metric comparison.` : "");
    trace.push("Comparison Agent compared method, dataset and metrics across the selected papers");
    return { result: `${selected.length} papers compared across method, dataset & metrics.`, sources: selected.length };
  });

  await run("gap", async () => {
    results.gaps = findGaps(selected, corpusSel, plan);
    const lim = selected.filter((p) => p.limitSentences.length).length;
    trace.push(`Research Gap Agent mined limitation statements (${lim} of ${selected.length} abstracts contain some) and clustered recurring themes into ${results.gaps.length} gap(s)`);
    return { result: results.gaps.length ? `${results.gaps.length} research gaps derived from stated limitations.` : "No explicit limitations found in the abstracts.", sources: lim };
  });

  await run("citation", async () => {
    trace.push("Citation Agent generated IEEE, APA, MLA and BibTeX references from source metadata");
    return { result: `${selected.length} references generated in IEEE, APA, MLA & BibTeX.`, sources: selected.length };
  });

  await run("dataset", async () => {
    const hf = await datasetsP;
    if (signal?.aborted) throw abortError();
    const mined = new Map();
    for (const p of selected) for (const n of p.datasetNames) {
      const k = n.toLowerCase();
      if (!mined.has(k)) mined.set(k, { name: n, related: [] });
      mined.get(k).related.push(p.id);
    }
    const minedList = [...mined.values()].sort((a, b) => b.related.length - a.related.length).slice(0, 5).map((m) => ({
      name: m.name, domain: `Referenced by ${m.related.length} selected paper${m.related.length > 1 ? "s" : ""}`,
      size: "Not stated in abstracts", modalities: "—", license: "See dataset page", source: "Mentioned in abstracts",
      related: m.related, url: `https://huggingface.co/datasets?search=${encodeURIComponent(m.name)}`,
    }));
    const hfList = (hf.ok ? hf.v : []).map((d) => {
      const short = d.name.split("/").pop().toLowerCase();
      const related = short.length >= 4 ? selected.filter((p) => p.fullAbstract.toLowerCase().includes(short)).map((p) => p.id) : [];
      return { ...d, related };
    });
    const names = new Set(minedList.map((d) => d.name.toLowerCase()));
    results.datasets = [...minedList, ...hfList.filter((d) => !names.has(d.name.toLowerCase()))].slice(0, 8).map((d, i) => ({ id: `d${i + 1}`, ...d }));
    trace.push(`Dataset Agent combined ${minedList.length} dataset name(s) mined from abstracts with ${hf.ok ? hfList.length : 0} Hugging Face search result(s)` + (hf.ok ? "" : " (Hugging Face unavailable)"));
    return { result: results.datasets.length ? `${results.datasets.length} relevant datasets found.` : "No datasets found for this topic.", sources: results.datasets.length };
  });

  await run("graph", async () => {
    results.graph = buildGraph(selected, results.datasets, corpusSel, plan, question);
    trace.push(`Knowledge Graph Agent linked ${results.graph.nodes.length - 1} nodes (papers, shared concepts, datasets) to the query`);
    return { result: `Knowledge graph built with ${results.graph.nodes.length} nodes and ${results.graph.edges.length} links.`, sources: selected.length };
  });

  await run("trend", async () => {
    const tr = await trendsP;
    if (signal?.aborted) throw abortError();
    let data = tr.ok ? tr.v : null;
    let basis = "OpenAlex yearly counts";
    if (!data) {
      const counts = new Map();
      for (const p of searchOut.candidates) if (p.year) counts.set(p.year, (counts.get(p.year) || 0) + 1);
      data = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([year, papers]) => ({ year, papers, partial: false }));
      basis = "the retrieved sample only (yearly counts unavailable)";
    }
    const emerging = emergingTopics(searchOut.candidates, ranked.corpus, plan);
    results.trend = { data, basis, sampleOnly: !tr.ok, emerging: emerging.topics, emergingBasis: emerging.basis };
    results.trend.note = trendNote(results.trend, emerging);
    trace.push(`Trend Agent aggregated publication counts by year (${basis}) and compared term frequency between recent and older papers`);
    return { result: `Publication trend mapped over ${data.length} years; ${emerging.topics.length} topics tracked.`, sources: searchOut.candidates.length };
  });

  await run("report", async () => {
    const areas = topTerms(selected.map((p) => p._idx), corpusSel, { n: 6, exclude: plan.stems, minDf: 2 }).map((t) => corpusSel.display(t.term));
    const years = selected.map((p) => p.year).filter((y) => typeof y === "number");
    results.areas = areas;
    results.papers = selected.map((p) => { const rest = { ...p }; delete rest._idx; return rest; });
    results.stats = {
      candidates: searchOut.candidates.length,
      matching: searchOut.matching,
      selected: selected.length,
      sources: searchOut.sources,
      yearRange: years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "n/a",
      areasCount: areas.length,
    };
    results.trace = trace;
    const linked = results.papers.filter((p) => p.url).length;
    results.evidenceCoverage = Math.round((100 * linked) / results.papers.length);
    results.report = buildReport({ ...results, trend: results.trend });
    const top = [...results.papers].sort((a, b) => b.citations - a.citations)[0];
    const m = results.papers.filter((p) => p.hasMetrics).slice(0, 2);
    results.evidence = [
      { claim: `The most-cited paper in this set is “${clip(top.title, 100)}”.`, paper: `${top.id.toUpperCase()} — ${clip(top.title, 80)}`, evidence: `${top.citations.toLocaleString()} citations`, source: `${top.source}, ${top.year}`, url: top.url },
      ...m.map((p) => ({ claim: `${authorLabel(p)} report quantitative results in their abstract.`, paper: `${p.id.toUpperCase()} — ${clip(p.title, 80)}`, evidence: p.metrics, source: `${p.source}, ${p.year}`, url: p.url })),
      ...results.gaps.filter((g) => g.confidence !== "Low").slice(0, 2).map((g) => {
        const p = results.papers.find((x) => x.id === g.papers[0]);
        return { claim: `Recurring limitation: ${g.term}.`, paper: `${p.id.toUpperCase()} — ${clip(p.title, 80)}`, evidence: `Stated in ${g.papers.length} of ${results.papers.length} abstracts`, source: `${p.source}, ${p.year}`, url: p.url };
      }),
    ];
    results.overview = {
      summary:
        `Across ${results.papers.length} selected papers (of ${searchOut.candidates.length} retrieved with abstracts), research on “${plan.display}” centres on ${areas.slice(0, 3).join(", ") || "a broad mix of themes"}. ` +
        `${results.papers.filter((p) => p.hasMetrics).length} papers report numeric results in their abstracts. ` +
        (results.gaps.length ? `Recurring limitations point to ${results.gaps.slice(0, 2).map((g) => g.term).join(" and ")} as under-addressed.` : "No explicit limitations were stated, so no gaps are asserted."),
    };
    trace.push("Report Agent compiled the 11-section report from the extracted data above");
    return { result: "Structured 11-section research report compiled.", sources: selected.length };
  });

  return results;
}
