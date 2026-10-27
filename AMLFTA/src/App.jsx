import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { runResearch, formatCitation, CITATION_FORMAT_NAMES, reportToMarkdown, reportToHTML } from "./lib/research.js";
import {
  Search, Brain, GitCompare, Lightbulb, Quote, Database, Share2, TrendingUp,
  FileText, ChevronRight, ChevronDown, ArrowRight, CheckCircle2, Circle,
  Loader2, ExternalLink, Copy, Plus, Filter, Sparkles,
  BookOpen, FolderOpen, Settings, Network, Clock, ShieldCheck,
  AlertTriangle, Download, Check,
  RefreshCw, Link2, Microscope, LayoutGrid, ListChecks
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/* ---------------------------------------------------------------------- */
/* Design tokens                                                          */
/* ---------------------------------------------------------------------- */
const T = {
  cream: "#FAF6EE",
  card: "#FFFDF8",
  ink: "#372A20",
  inkSoft: "#6B5C4E",
  line: "#E7DCC9",
  terracotta: "#C1592B",
  terracottaDark: "#9E4620",
  amber: "#C98A2C",
  olive: "#707B4F",
  success: "#5C7A52",
  warn: "#C98A2C",
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');`;

/* ---------------------------------------------------------------------- */
/* Agents & stages                                                        */
/* ---------------------------------------------------------------------- */
const AGENT_DEFS = [
  { key: "coordinator", name: "Coordinator Agent", icon: Brain, task: "Planning research workflow" },
  { key: "search", name: "Search Agent", icon: Search, task: "Searching OpenAlex & Semantic Scholar" },
  { key: "summary", name: "Summary Agent", icon: FileText, task: "Extracting key findings from papers" },
  { key: "comparison", name: "Comparison Agent", icon: GitCompare, task: "Comparing methodologies & results" },
  { key: "gap", name: "Research Gap Agent", icon: Lightbulb, task: "Identifying unexplored areas" },
  { key: "citation", name: "Citation Agent", icon: Quote, task: "Preparing IEEE / APA / MLA references" },
  { key: "dataset", name: "Dataset Agent", icon: Database, task: "Finding datasets on Hugging Face & in abstracts" },
  { key: "graph", name: "Knowledge Graph Agent", icon: Share2, task: "Mapping papers, methods & datasets" },
  { key: "trend", name: "Trend Agent", icon: TrendingUp, task: "Analyzing publication trends" },
  { key: "report", name: "Report Agent", icon: BookOpen, task: "Preparing final research report" },
];

const STAGES = ["Query", "Search", "Summarize", "Compare", "Gaps", "Datasets", "Trends", "Report"];

/* ---------------------------------------------------------------------- */
/* Small building blocks                                                  */
/* ---------------------------------------------------------------------- */
function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "#F4EEE1", fg: T.inkSoft, bd: T.line },
    terracotta: { bg: "#F4E2D6", fg: T.terracottaDark, bd: "#E7C4AA" },
    amber: { bg: "#F6E7CB", fg: "#8A5E17", bd: "#E9CC94" },
    success: { bg: "#E4EBDF", fg: "#425939", bd: "#CBDAC0" },
  };
  const c = tones[tone] || tones.neutral;
  return (
    <span style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}
      className="px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide">
      {children}
    </span>
  );
}

function Card({ children, className = "", style = {} }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{ background: T.card, border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(55,42,32,0.04), 0 8px 24px -16px rgba(55,42,32,0.15)", ...style }}
    >
      {children}
    </div>
  );
}

function SectionHeading({ eyebrow, title, right }) {
  return (
    <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
      <div>
        {eyebrow && <div className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-1" style={{ color: T.terracottaDark }}>{eyebrow}</div>}
        <h2 style={{ fontFamily: "Fraunces, serif", color: T.ink }} className="text-2xl md:text-[26px] font-medium">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    waiting: { icon: Circle, label: "Waiting", color: T.inkSoft, bg: "#F0EAE0" },
    running: { icon: Loader2, label: "Working", color: T.terracottaDark, bg: "#F4E2D6", spin: true },
    done: { icon: CheckCircle2, label: "Completed", color: "#425939", bg: "#E4EBDF" },
    review: { icon: AlertTriangle, label: "Needs Review", color: "#8A5E17", bg: "#F6E7CB" },
  };
  const m = map[status];
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full" style={{ color: m.color, background: m.bg }}>
      <Icon size={12} className={m.spin ? "animate-spin" : ""} />
      {m.label}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* Landing page                                                           */
/* ---------------------------------------------------------------------- */
function AgentConstellation() {
  const R = 140, cx = 200, cy = 190;
  const nodes = AGENT_DEFS.slice(1, 9);
  return (
    <svg viewBox="0 0 400 380" className="w-full max-w-md mx-auto">
      {nodes.map((n, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + R * Math.cos(angle), y = cy + R * Math.sin(angle);
        return <line key={n.key} x1={cx} y1={cy} x2={x} y2={y} stroke={T.line} strokeWidth="1.5" />;
      })}
      <circle cx={cx} cy={cy} r="46" fill="#FFF" stroke={T.terracotta} strokeWidth="2" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="Fraunces, serif" fontSize="12" fill={T.ink} fontWeight="600">Research</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontFamily="Fraunces, serif" fontSize="12" fill={T.ink} fontWeight="600">Question</text>
      {nodes.map((n, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + R * Math.cos(angle), y = cy + R * Math.sin(angle);
        const Icon = n.icon;
        return (
          <g key={n.key} style={{ animation: `float 4s ease-in-out ${i * 0.3}s infinite` }}>
            <circle cx={x} cy={y} r="26" fill="#FFF" stroke={T.amber} strokeWidth="1.5" />
            <foreignObject x={x - 11} y={y - 11} width="22" height="22">
              <Icon size={22} color={T.terracottaDark} />
            </foreignObject>
          </g>
        );
      })}
      <style>{`@keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-5px); } }`}</style>
    </svg>
  );
}

function Landing({ onStart }) {
  const [q, setQ] = useState("");
  const examples = ["AI in Healthcare", "Renewable Energy", "Cybersecurity", "Quantum Computing", "Computer Vision"];
  return (
    <div style={{ background: T.cream, minHeight: "100vh" }} className="font-sans">
      <style>{FONT_IMPORT}</style>
      <header className="max-w-6xl mx-auto px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.terracotta }}>
            <Microscope size={17} color="#fff" />
          </div>
          <span style={{ fontFamily: "Fraunces, serif", color: T.ink }} className="text-lg font-semibold">ResearchAI</span>
        </div>
        <div className="text-xs" style={{ color: T.inkSoft }}>Multi-Agent Research Assistant</div>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-6" style={{ background: "#F4E2D6", color: T.terracottaDark }}>
          <Sparkles size={13} /> <span className="text-xs font-medium">10 specialized agents, one research workflow</span>
        </div>
        <h1 style={{ fontFamily: "Fraunces, serif", color: T.ink }} className="text-4xl md:text-5xl font-medium leading-[1.1]">
          From Research Question<br />to Scientific Insight.
        </h1>
        <p style={{ color: T.inkSoft }} className="mt-5 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
          Your multi-agent AI research assistant for discovering papers, comparing evidence,
          identifying research gaps, finding datasets, and generating structured research reports.
        </p>

        <div className="mt-9 text-left max-w-2xl mx-auto">
          <label className="text-sm font-medium mb-2 block" style={{ color: T.ink }}>What would you like to research?</label>
          <Card className="p-3 flex items-center gap-2">
            <Search size={18} color={T.inkSoft} className="ml-1 shrink-0" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Explore recent approaches for detecting deepfakes using multimodal AI"
              className="flex-1 bg-transparent outline-none text-sm py-2"
              style={{ color: T.ink }}
              onKeyDown={(e) => e.key === "Enter" && q.trim() && onStart(q)}
            />
          </Card>
          <button
            onClick={() => onStart(q || "Explore recent approaches for detecting deepfakes using multimodal AI")}
            className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-medium text-sm transition-transform hover:scale-[1.01]"
            style={{ background: T.terracotta }}
          >
            Start Research <ArrowRight size={16} />
          </button>
        </div>

        <p className="mt-6 text-xs" style={{ color: T.inkSoft }}>
          Results are fetched live from OpenAlex, Semantic Scholar and Hugging Face, then analyzed in your browser.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {examples.map((e) => (
            <button key={e} onClick={() => onStart(e)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{ background: T.card, border: `1px solid ${T.line}`, color: T.inkSoft }}>
              {e}
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-24">
        <AgentConstellation />
        <p className="text-center text-xs mt-2" style={{ color: T.inkSoft }}>
          A coordinated team of agents — search, summarize, compare, find gaps, recommend datasets, map knowledge, track trends, cite & report.
        </p>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Workspace (live agent activity)                                        */
/* ---------------------------------------------------------------------- */
function AgentCard({ def, status, result, sources }) {
  const Icon = def.icon;
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: status === "waiting" ? "#F0EAE0" : "#F4E2D6" }}>
            <Icon size={17} color={status === "waiting" ? T.inkSoft : T.terracottaDark} />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: T.ink }}>{def.name}</div>
            <div className="text-xs" style={{ color: T.inkSoft }}>{def.task}</div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <StatusPill status={status} />
        {sources != null && <span className="text-xs" style={{ color: T.inkSoft }}>{sources} sources</span>}
      </div>
      {result && <div className="text-xs pt-2 border-t" style={{ borderColor: T.line, color: T.ink }}>{result}</div>}
    </Card>
  );
}

function Workspace({ question, onDone, onNew }) {
  const [agents, setAgents] = useState({});
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let timer;
    runResearch(question, {
      signal: ctrl.signal,
      onAgent: (key, status, payload) => setAgents((a) => ({ ...a, [key]: { status, ...(payload || {}) } })),
    })
      .then((res) => { timer = setTimeout(() => onDone(res), 500); })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Something went wrong while researching this topic.");
      });
    return () => { ctrl.abort(); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, attempt]);

  const retry = () => { setAgents({}); setError(null); setAttempt((n) => n + 1); };
  const doneCount = AGENT_DEFS.filter((d) => agents[d.key]?.status === "done").length;
  const stageIdx = Math.min(Math.floor((doneCount / AGENT_DEFS.length) * STAGES.length), STAGES.length - 1);

  return (
    <div style={{ background: T.cream, minHeight: "100vh" }} className="font-sans flex">
      <style>{FONT_IMPORT}</style>
      <Sidebar active="new" onNew={onNew} question={question} />
      <main className="flex-1 min-w-0 px-6 md:px-10 py-8 max-w-6xl">
        <div className="text-xs font-medium mb-1" style={{ color: T.terracottaDark }}>{error ? "RESEARCH STOPPED" : "RESEARCH IN PROGRESS"}</div>
        <h1 style={{ fontFamily: "Fraunces, serif", color: T.ink }} className="text-2xl font-medium mb-1">"{question}"</h1>
        <p className="text-sm mb-6" style={{ color: T.inkSoft }}>ResearchAI is coordinating 10 agents over live scholarly sources.</p>

        {error && (
          <Card className="p-5 mb-8" style={{ borderColor: "#E9CC94", background: "#FFF8EA" }}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} color="#8A5E17" className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-semibold mb-1" style={{ color: T.ink }}>Couldn't complete this research</div>
                <p className="text-sm" style={{ color: T.ink }}>{error}</p>
                <div className="flex gap-2 mt-4">
                  <button onClick={retry} className="text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5" style={{ background: T.terracotta, color: "#fff" }}>
                    <RefreshCw size={12} /> Try again
                  </button>
                  <button onClick={onNew} className="text-xs font-medium px-3 py-2 rounded-lg" style={{ border: `1px solid ${T.line}`, color: T.ink }}>
                    Change question
                  </button>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-4 mb-8 overflow-x-auto">
          <div className="flex items-center min-w-max">
            {STAGES.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex flex-col items-center gap-1.5 px-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                    style={{
                      background: i < stageIdx ? T.success : i === stageIdx ? T.terracotta : "#F0EAE0",
                      color: i <= stageIdx ? "#fff" : T.inkSoft,
                    }}>
                    {i < stageIdx ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className="text-[11px] font-medium" style={{ color: i <= stageIdx ? T.ink : T.inkSoft }}>{s}</span>
                </div>
                {i < STAGES.length - 1 && <div className="h-px w-8 md:w-14" style={{ background: i < stageIdx ? T.success : T.line }} />}
              </React.Fragment>
            ))}
          </div>
        </Card>

        <SectionHeading eyebrow="Live agent activity" title="AI Research Team" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-16">
          {AGENT_DEFS.map((def) => {
            const a = agents[def.key];
            const status = a?.status === "done" ? "done" : a?.status === "running" && !error ? "running" : "waiting";
            return <AgentCard key={def.key} def={def} status={status} result={status === "done" ? a.result : null} sources={status === "done" ? a.sources : null} />;
          })}
        </div>
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Sidebar                                                                */
/* ---------------------------------------------------------------------- */
function Sidebar({ active, onNav, onNew, question }) {
  const items = [
    { key: "new", label: "New Research", icon: Plus },
    { key: "overview", label: "My Research", icon: FolderOpen },
    { key: "papers", label: "Saved Papers", icon: BookOpen },
    { key: "report", label: "Reports", icon: FileText },
    { key: "datasets", label: "Datasets", icon: Database },
    { key: "graph", label: "Knowledge Graph", icon: Network },
    { key: "trends", label: "Research Trends", icon: TrendingUp },
    { key: "settings", label: "Settings", icon: Settings },
  ];
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col justify-between border-r px-4 py-6" style={{ borderColor: T.line }}>
      <div>
        <div className="flex items-center gap-2 px-1 mb-8">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: T.terracotta }}>
            <Microscope size={14} color="#fff" />
          </div>
          <span style={{ fontFamily: "Fraunces, serif", color: T.ink }} className="text-base font-semibold">ResearchAI</span>
        </div>
        <nav className="flex flex-col gap-0.5">
          {items.map((it) => {
            const Icon = it.icon;
            const isActive = active === it.key;
            return (
              <button key={it.key}
                onClick={() => (it.key === "new" ? onNew() : onNav && onNav(it.key))}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-left"
                style={{ background: isActive ? "#F4E2D6" : "transparent", color: isActive ? T.terracottaDark : T.inkSoft }}>
                <Icon size={15} /> {it.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="px-3 py-3 rounded-xl" style={{ background: T.card, border: `1px solid ${T.line}` }}>
        <div className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: T.terracottaDark }}>Current Research</div>
        <div className="text-xs leading-snug" style={{ color: T.ink }}>{question}</div>
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------------- */
/* Dashboard tabs                                                         */
/* ---------------------------------------------------------------------- */
const TABS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "papers", label: "Papers", icon: BookOpen },
  { key: "comparison", label: "Comparison", icon: GitCompare },
  { key: "gaps", label: "Research Gaps", icon: Lightbulb },
  { key: "datasets", label: "Datasets", icon: Database },
  { key: "graph", label: "Knowledge Graph", icon: Network },
  { key: "trends", label: "Trends", icon: TrendingUp },
  { key: "citations", label: "Citations", icon: Quote },
  { key: "report", label: "Report", icon: FileText },
  { key: "evidence", label: "Evidence & Trace", icon: ShieldCheck },
];

const DataCtx = createContext(null);
const useData = () => useContext(DataCtx);

function CopyButton({ text, label = "Copy", icon = true, className = "", style = {} }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button onClick={copy} className={`text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 ${className}`}
      style={{ border: `1px solid ${T.line}`, color: T.ink, ...style }}>
      {icon && (done ? <Check size={12} /> : <Copy size={12} />)} {done ? "Copied" : label}
    </button>
  );
}

function downloadFile(name, mime, content) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "research";

function EmptyNote({ children }) {
  return (
    <Card className="p-6 text-sm" style={{ color: T.inkSoft }}>{children}</Card>
  );
}

function OverviewTab() {
  const { overview, stats, areas, evidenceCoverage } = useData();
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionHeading eyebrow="Executive summary" title="Research Overview" />
        <p className="text-sm leading-relaxed" style={{ color: T.ink }}>{overview.summary}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          {[
            ["Papers analyzed", stats.selected], ["Papers retrieved", stats.candidates],
            ["Publication range", stats.yearRange], ["Research areas", stats.areasCount],
          ].map(([k, v]) => (
            <div key={k} className="p-3 rounded-xl" style={{ background: T.cream, border: `1px solid ${T.line}` }}>
              <div style={{ fontFamily: "Fraunces, serif", color: T.terracottaDark }} className="text-2xl font-medium">{v}</div>
              <div className="text-xs mt-0.5" style={{ color: T.inkSoft }}>{k}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#F0EAE0" }}>
            <div className="h-full rounded-full" style={{ width: `${evidenceCoverage}%`, background: T.success }} />
          </div>
          <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "#425939" }}>Source-link coverage: {evidenceCoverage}%</span>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="text-sm font-semibold mb-3" style={{ color: T.ink }}>Main Research Areas</div>
          <div className="flex flex-wrap gap-2">
            {areas.length ? areas.map((a) => <Badge key={a} tone="terracotta">{a}</Badge>) : <span className="text-xs" style={{ color: T.inkSoft }}>No recurring concepts found.</span>}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-semibold mb-3" style={{ color: T.ink }}>How to read these results</div>
          <p className="text-xs leading-relaxed" style={{ color: T.inkSoft }}>
            Everything here is computed from the titles and abstracts retrieved from {stats.sources.join(" and ")} just now.
            Relevance is relative to the best match in the retrieved set. Gaps marked “Low” rest on a single paper — treat them as
            leads to verify in the full text, not conclusions.
          </p>
        </Card>
      </div>
    </div>
  );
}

function PapersTab({ selected, toggleSelect }) {
  const { papers: all, stats } = useData();
  const [sort, setSort] = useState("relevance");
  const papers = useMemo(() => {
    const arr = [...all];
    if (sort === "relevance") arr.sort((a, b) => b.relevance - a.relevance);
    if (sort === "newest") arr.sort((a, b) => (b.year || 0) - (a.year || 0));
    if (sort === "cited") arr.sort((a, b) => b.citations - a.citations);
    return arr;
  }, [sort, all]);
  const [open, setOpen] = useState(null);

  return (
    <div>
      <SectionHeading eyebrow={`${papers.length} of ${stats.candidates} retrieved`} title="Relevant Papers"
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs flex items-center gap-1" style={{ color: T.inkSoft }}><Filter size={13} /> Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5" style={{ border: `1px solid ${T.line}`, background: T.card, color: T.ink }}>
              <option value="relevance">Sort: Relevance</option>
              <option value="newest">Sort: Newest</option>
              <option value="cited">Sort: Most cited</option>
            </select>
          </div>
        }
      />
      <div className="grid gap-4">
        {papers.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge tone="terracotta">{p.relevance}% relevant</Badge>
                  <Badge>{p.source}</Badge>
                  {p.oa && <Badge tone="success">Open access</Badge>}
                </div>
                <h3 style={{ fontFamily: "Fraunces, serif", color: T.ink }} className="text-lg font-medium leading-snug">{p.title}</h3>
                <div className="text-xs mt-1" style={{ color: T.inkSoft }}>{p.authors} · {p.venue} · {p.year} · {p.citations.toLocaleString()} citations</div>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: T.ink }}>{p.abstract}</p>
                {open === p.id && (
                  <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs">
                    <div><span className="font-semibold" style={{ color: T.terracottaDark }}>Key contribution — </span><span style={{ color: T.ink }}>{p.contribution}</span></div>
                    <div><span className="font-semibold" style={{ color: T.terracottaDark }}>Methodology — </span><span style={{ color: T.ink }}>{p.methodology}</span></div>
                    <div><span className="font-semibold" style={{ color: T.terracottaDark }}>Dataset — </span><span style={{ color: T.ink }}>{p.dataset}</span></div>
                    <div><span className="font-semibold" style={{ color: T.terracottaDark }}>Metrics — </span><span style={{ color: T.ink }}>{p.metrics}</span></div>
                    <div className="sm:col-span-2"><span className="font-semibold" style={{ color: "#8A5E17" }}>Limitations — </span><span style={{ color: T.ink }}>{p.limitations}</span></div>
                    <div className="sm:col-span-2"><span className="font-semibold" style={{ color: T.inkSoft }}>Full abstract — </span><span style={{ color: T.inkSoft }}>{p.fullAbstract}</span></div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={() => setOpen(open === p.id ? null : p.id)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"
                  style={{ border: `1px solid ${T.line}`, color: T.ink }}>
                  {open === p.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />} AI Summary
                </button>
                <button onClick={() => toggleSelect(p.id)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"
                  style={{ background: selected.includes(p.id) ? T.terracotta : "transparent", color: selected.includes(p.id) ? "#fff" : T.terracottaDark, border: `1px solid ${T.terracotta}` }}>
                  <Plus size={13} /> {selected.includes(p.id) ? "Added" : "Add to Report"}
                </button>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1 justify-center hover:underline" style={{ color: T.terracottaDark }}>
                    <ExternalLink size={12} /> Open Paper
                  </a>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ComparisonTab() {
  const { papers: rows, comparisonSummary } = useData();
  return (
    <div>
      <SectionHeading eyebrow="Comparison agent" title="Paper Comparison" />
      <Card className="p-0 overflow-x-auto mb-6">
        <table className="w-full text-xs min-w-[900px]">
          <thead>
            <tr style={{ background: T.cream }}>
              {["Paper", "Method", "Dataset", "Metrics", "Contribution", "Limitations"].map((h) => (
                <th key={h} className="text-left font-semibold px-4 py-3" style={{ color: T.terracottaDark }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} className="align-top" style={{ borderTop: `1px solid ${T.line}`, background: i % 2 ? T.card : "#FFFCF6" }}>
                <td className="px-4 py-3 font-medium max-w-[200px]" style={{ color: T.ink }}>{p.title} <span style={{ color: T.inkSoft }} className="font-normal">({p.year})</span></td>
                <td className="px-4 py-3" style={{ color: T.ink }}>{p.methodology}</td>
                <td className="px-4 py-3" style={{ color: T.ink }}>{p.dataset}</td>
                <td className="px-4 py-3" style={{ color: T.ink }}>{p.metrics}</td>
                <td className="px-4 py-3" style={{ color: "#425939" }}>{p.contribution}</td>
                <td className="px-4 py-3" style={{ color: "#8A5E17" }}>{p.limitations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="p-5">
        <div className="text-sm font-semibold mb-2" style={{ color: T.ink }}>Comparison Summary</div>
        <p className="text-sm leading-relaxed" style={{ color: T.ink }}>{comparisonSummary}</p>
      </Card>
    </div>
  );
}

function GapsTab() {
  const { gaps, papers } = useData();
  const [openGap, setOpenGap] = useState(null);
  return (
    <div>
      <SectionHeading eyebrow={`${gaps.length} gap${gaps.length === 1 ? "" : "s"} derived from stated limitations`} title="Research Gaps" />
      {!gaps.length && <EmptyNote>None of the retrieved abstracts state limitations or open problems explicitly, so no gaps are asserted. Reading the full texts would be the next step.</EmptyNote>}
      <div className="grid gap-4">
        {gaps.map((g, i) => (
          <Card key={g.id} className="p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <div style={{ fontFamily: "Fraunces, serif", color: T.ink }} className="text-lg font-medium">Gap #{i + 1} — {g.title}</div>
              <Badge tone={g.confidence === "High" ? "success" : "amber"}>{g.confidence} confidence</Badge>
            </div>
            <p className="text-sm leading-relaxed mb-3" style={{ color: T.ink }}>{g.body}</p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs mb-3">
              <div className="p-3 rounded-lg" style={{ background: T.cream }}>
                <div className="font-semibold mb-1" style={{ color: T.terracottaDark }}>Why this matters</div>
                <span style={{ color: T.ink }}>{g.why}</span>
              </div>
              <div className="p-3 rounded-lg" style={{ background: T.cream }}>
                <div className="font-semibold mb-1" style={{ color: T.terracottaDark }}>Potential research direction</div>
                <span style={{ color: T.ink }}>{g.direction}</span>
              </div>
            </div>
            <button onClick={() => setOpenGap(openGap === g.id ? null : g.id)}
              className="text-xs font-medium flex items-center gap-1" style={{ color: T.terracottaDark }}>
              {openGap === g.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Show supporting papers
            </button>
            {openGap === g.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                {g.papers.map((pid) => {
                  const p = papers.find((x) => x.id === pid);
                  if (!p) return null;
                  return <Badge key={pid}>{p.title.slice(0, 40)}{p.title.length > 40 ? "…" : ""} ({p.year})</Badge>;
                })}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function DatasetsTab() {
  const { datasets, papers } = useData();
  return (
    <div>
      <SectionHeading eyebrow="Dataset agent" title="Recommended Datasets" />
      {!datasets.length && <EmptyNote>No datasets were named in the selected abstracts and none matched this topic on Hugging Face.</EmptyNote>}
      <div className="grid sm:grid-cols-2 gap-4">
        {datasets.map((d) => (
          <Card key={d.id} className="p-5">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 style={{ fontFamily: "Fraunces, serif", color: T.ink }} className="text-base font-medium break-all">{d.name}</h3>
              <Badge>{d.source}</Badge>
            </div>
            <div className="text-xs mb-3" style={{ color: T.inkSoft }}>{d.domain}</div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div><span className="font-semibold" style={{ color: T.terracottaDark }}>Size — </span>{d.size}</div>
              <div><span className="font-semibold" style={{ color: T.terracottaDark }}>Modalities — </span>{d.modalities}</div>
              <div className="col-span-2"><span className="font-semibold" style={{ color: T.terracottaDark }}>License — </span>{d.license}</div>
            </div>
            {d.related.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {d.related.map((pid) => <Badge key={pid} tone="terracotta">{papers.find((p) => p.id === pid)?.title.slice(0, 24)}…</Badge>)}
              </div>
            )}
            <a href={d.url} target="_blank" rel="noreferrer" className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: T.terracottaDark }}>
              <ExternalLink size={12} /> View dataset
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}

function GraphTab() {
  const { graph } = useData();
  const { nodes, edges } = graph;
  const colorFor = { area: T.terracotta, paper: T.amber, concept: T.olive, dataset: "#8A6BAE" };
  const legend = { area: "Topic", paper: "Paper", concept: "Shared concept", dataset: "Dataset" };
  return (
    <div>
      <SectionHeading eyebrow="Knowledge graph agent" title="Knowledge Graph" />
      <Card className="p-4">
        <svg viewBox="0 0 600 400" className="w-full" style={{ maxHeight: 460 }}>
          {edges.map(([a, b], i) => {
            const A = nodes.find((n) => n.id === a), B = nodes.find((n) => n.id === b);
            if (!A || !B) return null;
            return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={T.line} strokeWidth="1.5" />;
          })}
          {nodes.map((n) => {
            const words = n.label.split(" ");
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r={n.type === "area" ? 42 : 30} fill="#FFF" stroke={colorFor[n.type]} strokeWidth="2" />
                <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="middle" fontFamily="IBM Plex Sans, sans-serif" fontSize="9.5" fill={T.ink} fontWeight="500">
                  {words.map((w, i) => <tspan key={i} x={n.x} dy={i === 0 ? -((words.length - 1) * 5.5) : 11}>{w}</tspan>)}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs" style={{ borderColor: T.line }}>
          {Object.entries(colorFor).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5" style={{ color: T.inkSoft }}>
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} /> {legend[k]}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TrendsTab() {
  const { trend } = useData();
  const anyChange = trend.emerging.some((t) => t.trend !== "steady");
  const badge = {
    up: ["success", "↑ rising"],
    down: ["amber", "↓ declining"],
    steady: ["neutral", "● recurring"],
  };
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Trend analysis agent" title="Research Trends" />
      <Card className="p-5">
        <div className="text-sm font-semibold mb-1" style={{ color: T.ink }}>Publication Trends</div>
        <div className="text-xs mb-3" style={{ color: T.inkSoft }}>Source: {trend.basis}. The latest year is year-to-date.</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend.data}>
              <CartesianGrid stroke={T.line} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={{ stroke: T.line }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="papers" stroke={T.terracotta} strokeWidth={2.5} dot={{ r: 3, fill: T.terracotta }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="text-sm font-semibold mb-1" style={{ color: T.ink }}>{anyChange ? "Emerging Topics" : "Frequent Topics"}</div>
          <div className="text-xs mb-3" style={{ color: T.inkSoft }}>Basis: {trend.emergingBasis}.</div>
          <div className="flex flex-col gap-2">
            {trend.emerging.length === 0 && <span className="text-xs" style={{ color: T.inkSoft }}>Not enough data.</span>}
            {trend.emerging.map((t) => (
              <div key={t.name} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ background: T.cream }}>
                <div>
                  <div className="text-sm" style={{ color: T.ink }}>{t.name}</div>
                  <div className="text-[11px]" style={{ color: T.inkSoft }}>{t.evidence}</div>
                </div>
                <Badge tone={badge[t.trend][0]}>{badge[t.trend][1]}</Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-semibold mb-3" style={{ color: T.ink }}>Trend Note</div>
          <p className="text-sm leading-relaxed" style={{ color: T.ink }}>{trend.note}</p>
        </Card>
      </div>
    </div>
  );
}

function CitationsTab() {
  const { papers } = useData();
  const [fmt, setFmt] = useState("IEEE");
  const all = papers.map((p, i) => formatCitation(fmt, p, i)).join("\n\n");
  return (
    <div>
      <SectionHeading eyebrow="Citation agent" title="Citation Generator"
        right={
          <div className="flex gap-1.5 flex-wrap">
            {CITATION_FORMAT_NAMES.map((f) => (
              <button key={f} onClick={() => setFmt(f)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: fmt === f ? T.terracotta : T.card, color: fmt === f ? "#fff" : T.ink, border: `1px solid ${fmt === f ? T.terracotta : T.line}` }}>
                {f}
              </button>
            ))}
            <CopyButton text={all} label="Copy all" className="py-1.5" />
          </div>
        }
      />
      <div className="grid gap-3">
        {papers.map((p, i) => {
          const text = formatCitation(fmt, p, i);
          return (
            <Card key={p.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
              <code className="text-xs whitespace-pre-wrap break-words flex-1 min-w-[240px]" style={{ fontFamily: "IBM Plex Mono, monospace", color: T.ink }}>{text}</code>
              <div className="flex gap-2 shrink-0">
                <CopyButton text={text} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ReportTab({ question }) {
  const data = useData();
  const { report, papers } = data;
  const base = slug(question);
  return (
    <div>
      <SectionHeading eyebrow="Report agent" title="AI Research Report"
        right={
          <div className="flex gap-2 flex-wrap">
            <CopyButton text={reportToMarkdown(data)} label="Copy report" className="py-1.5 px-3" />
            <button onClick={() => window.print()} className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ border: `1px solid ${T.line}`, color: T.ink }}>
              <Download size={12} /> Print / PDF
            </button>
            <button onClick={() => downloadFile(`${base}-report.doc`, "application/msword", reportToHTML(data))}
              className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ background: T.terracotta, color: "#fff" }}>
              <Download size={12} /> Export Word
            </button>
          </div>
        }
      />
      <Card className="p-6">
        <h3 style={{ fontFamily: "Fraunces, serif", color: T.ink }} className="text-xl font-medium mb-4">{report.title}</h3>
        <div className="divide-y" style={{ borderColor: T.line }}>
          {report.sections.map((s) => (
            <div key={s.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-semibold" style={{ color: T.terracottaDark }}>{s.title}</h4>
                <CopyButton text={`${s.title}\n\n${s.body}`} label="" className="p-1.5 px-1.5" style={{ color: T.inkSoft }} />
              </div>
              <p className="text-sm leading-relaxed mt-2" style={{ color: T.ink }}>{s.body}</p>
            </div>
          ))}
          <div className="py-4">
            <h4 className="text-sm font-semibold mb-2" style={{ color: T.terracottaDark }}>References</h4>
            <div className="flex flex-col gap-1.5">
              {papers.map((p, i) => (
                <span key={p.id} className="text-xs break-words" style={{ fontFamily: "IBM Plex Mono, monospace", color: T.ink }}>
                  {formatCitation("IEEE", p, i)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function EvidenceTab() {
  const { evidence, evidenceCoverage, trace } = useData();
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Trust & transparency" title="Evidence & Sources" />
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <ShieldCheck size={20} color="#425939" />
          <div>
            <div className="text-sm font-semibold" style={{ color: T.ink }}>Source-link coverage: {evidenceCoverage}%</div>
            <div className="text-xs" style={{ color: T.inkSoft }}>Share of selected papers with a verifiable link (DOI or landing page).</div>
          </div>
        </div>
        {evidence.map((e, i) => (
          <div key={i} className="mb-4 last:mb-0 p-4 rounded-xl" style={{ background: T.cream, border: `1px solid ${T.line}` }}>
            <div className="text-sm font-medium mb-2" style={{ color: T.ink }}>"{e.claim}"</div>
            <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: T.inkSoft }}>
              <Link2 size={12} />
              {e.url ? (
                <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: T.terracottaDark, fontWeight: 500 }}>{e.paper}</a>
              ) : (
                <span style={{ color: T.terracottaDark, fontWeight: 500 }}>{e.paper}</span>
              )}
              <ChevronRight size={12} /> <span>{e.evidence}</span>
              <ChevronRight size={12} /> <span className="italic">{e.source}</span>
            </div>
          </div>
        ))}
      </Card>

      <Card className="p-6">
        <div className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: T.ink }}>
          <Clock size={15} /> How ResearchAI Reached This Result
        </div>
        <ol className="space-y-2">
          {trace.map((t, i) => (
            <li key={i} className="flex items-start gap-3 text-sm" style={{ color: T.ink }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5" style={{ background: "#F4E2D6", color: T.terracottaDark }}>{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Dashboard shell                                                        */
/* ---------------------------------------------------------------------- */
function Dashboard({ question, data, onNew }) {
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState([]);
  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const sidebarMap = { overview: "overview", papers: "papers", report: "report", datasets: "datasets", graph: "graph", trends: "trends" };

  return (
    <DataCtx.Provider value={data}>
      <div style={{ background: T.cream, minHeight: "100vh" }} className="font-sans flex">
        <style>{FONT_IMPORT}</style>
        <Sidebar active={tab} onNav={(k) => setTab(sidebarMap[k] || tab)} onNew={onNew} question={question} />
        <main className="flex-1 min-w-0">
          <div className="px-6 md:px-10 pt-8">
            <div className="flex items-center gap-2 text-xs mb-1" style={{ color: T.inkSoft }}>
              <ListChecks size={13} /> Research complete
            </div>
            <h1 style={{ fontFamily: "Fraunces, serif", color: T.ink }} className="text-2xl font-medium mb-5">"{question}"</h1>
            <div className="flex gap-1 overflow-x-auto pb-3 border-b" style={{ borderColor: T.line }}>
              {TABS.map((t) => {
                const Icon = t.icon;
                const isActive = tab === t.key;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                    style={{ background: isActive ? T.terracotta : "transparent", color: isActive ? "#fff" : T.inkSoft }}>
                    <Icon size={13} /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="px-6 md:px-10 py-6 pb-20">
            {tab === "overview" && <OverviewTab />}
            {tab === "papers" && <PapersTab selected={selected} toggleSelect={toggleSelect} />}
            {tab === "comparison" && <ComparisonTab />}
            {tab === "gaps" && <GapsTab />}
            {tab === "datasets" && <DatasetsTab />}
            {tab === "graph" && <GraphTab />}
            {tab === "trends" && <TrendsTab />}
            {tab === "citations" && <CitationsTab />}
            {tab === "report" && <ReportTab question={question} />}
            {tab === "evidence" && <EvidenceTab />}
          </div>
        </main>
      </div>
    </DataCtx.Provider>
  );
}

/* ---------------------------------------------------------------------- */
/* App root                                                               */
/* ---------------------------------------------------------------------- */
export default function App() {
  const [view, setView] = useState("landing");
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState(null);

  if (view === "landing") return <Landing onStart={(q) => { setQuestion(q.trim()); setResults(null); setView("workspace"); }} />;
  if (view === "workspace" || !results) {
    return <Workspace question={question} onDone={(r) => { setResults(r); setView("dashboard"); }} onNew={() => setView("landing")} />;
  }
  return <Dashboard question={question} data={results} onNew={() => setView("landing")} />;
}
