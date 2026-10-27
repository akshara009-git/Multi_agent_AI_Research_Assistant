# ResearchAI – Multi-Agent Research Assistant

React 19 + Vite 8 + Tailwind CSS 4 + Recharts + lucide-react.
Results are **dynamic**: every question triggers live searches and a text-analysis pipeline that runs in the browser. No API keys needed.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

Production build: `npm run build` then `npm run preview`. An internet connection is required while using the app.

## How the 10 agents work

| Agent | What it really does |
|---|---|
| Coordinator | Reduces the question to a keyword query, starts parallel lookups |
| Search | OpenAlex (primary) + Semantic Scholar (best effort), de-duplicates by DOI/title, keeps papers that have abstracts |
| Summary | TF-IDF ranking against the query, extractive 2-sentence summaries, extracts contribution / method / metrics / datasets / limitations with cue patterns |
| Comparison | Table + generated summary from the extracted fields |
| Research Gap | Mines limitation sentences, clusters recurring terms across papers; confidence = number of papers supporting it |
| Citation | IEEE / APA / MLA / BibTeX from real metadata (DOI, authors, venue) |
| Dataset | Dataset names mined from abstracts + Hugging Face dataset search |
| Knowledge Graph | Topic ↔ papers ↔ shared concepts ↔ datasets |
| Trend | Yearly publication counts from OpenAlex; rising/declining terms by comparing recent vs older papers |
| Report | 11-section report assembled from the data above (copy, print/PDF, Word export) |

## Limits to know about

* Analysis uses **titles and abstracts only**; it is heuristic, not a substitute for reading the papers.
* Semantic Scholar may rate-limit anonymous browsers; the app then continues with OpenAlex alone.
* If the topic is very niche or misspelled, you may get few papers; try broader keywords.

## Structure

```
index.html
postcss.config.js      Tailwind v4 via PostCSS
vite.config.js
src/main.jsx           entry point
src/App.jsx            UI (Landing -> Workspace -> Dashboard tabs)
src/lib/research.js    data fetching + NLP pipeline (no React)
src/index.css          Tailwind import + base styles
public/favicon.svg
```

Do not zip/share `node_modules` – run `npm install` on each machine.
