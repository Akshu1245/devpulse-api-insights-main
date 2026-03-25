"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ExternalLink, BookOpen, FileText, Globe, Loader2, Activity, Download } from "lucide-react";

interface DocResult {
  source: string;
  title: string;
  snippet: string;
  url: string;
  icon: typeof BookOpen;
}

interface SourceReport {
  source: string;
  count: number;
  durationMs: number;
}

interface SearchSnapshot {
  at: string;
  totalDurationMs: number;
  sourceReport: SourceReport[];
  resultCount: number;
}

async function timedSearch<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; durationMs: number; result: T | null }> {
  const started = performance.now();
  try {
    const result = await fn();
    return { label, durationMs: Math.round(performance.now() - started), result };
  } catch {
    return { label, durationMs: Math.round(performance.now() - started), result: null };
  }
}

async function searchWikipedia(query: string): Promise<DocResult[]> {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(query)}&srlimit=4`
  );
  if (!res.ok) return [];
  const payload = await res.json();
  return (payload.query?.search || []).map((item: { title: string; snippet: string }) => ({
    source: "Wikipedia",
    title: item.title,
    snippet: item.snippet.replace(/<[^>]*>/g, ""),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, "_"))}`,
    icon: Globe,
  }));
}

async function searchSemanticScholar(query: string): Promise<DocResult[]> {
  const res = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=4&fields=title,abstract,url`
  );
  if (!res.ok) return [];
  const payload = await res.json();
  return (payload.data || [])
    .filter((item: { title?: string }) => Boolean(item.title))
    .map((item: { title: string; abstract?: string; url?: string; paperId?: string }) => ({
      source: "Semantic Scholar",
      title: item.title,
      snippet: item.abstract || "No abstract available.",
      url: item.url || `https://www.semanticscholar.org/paper/${item.paperId}`,
      icon: FileText,
    }));
}

async function searchDuckDuckGo(query: string): Promise<DocResult[]> {
  const res = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query + " documentation")}&format=json&no_redirect=1&no_html=1`
  );
  if (!res.ok) return [];
  const payload = await res.json();
  const rows: DocResult[] = [];
  if (payload.Heading && payload.AbstractURL) {
    rows.push({
      source: "DuckDuckGo",
      title: payload.Heading,
      snippet: payload.Abstract || payload.AbstractText || "Live web result",
      url: payload.AbstractURL,
      icon: BookOpen,
    });
  }
  for (const topic of payload.RelatedTopics || []) {
    if (topic?.Text && topic?.FirstURL) {
      rows.push({
        source: "DuckDuckGo",
        title: String(topic.Text).slice(0, 90),
        snippet: topic.Text,
        url: topic.FirstURL,
        icon: BookOpen,
      });
    }
  }
  return rows.slice(0, 4);
}

async function searchCrossref(query: string): Promise<DocResult[]> {
  const res = await fetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=4`);
  if (!res.ok) return [];
  const payload = await res.json();
  return (payload.message?.items || []).map((item: { title?: string[]; URL?: string; abstract?: string }) => ({
    source: "Crossref",
    title: item.title?.[0] || "Untitled",
    snippet: (item.abstract || "Research index result").replace(/<[^>]*>/g, "").slice(0, 240),
    url: item.URL || "#",
    icon: FileText,
  }));
}

function dedupeResults(items: DocResult[]) {
  const seen = new Set<string>();
  const result: DocResult[] = [];
  for (const item of items) {
    const key = item.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export default function DocSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sourceReport, setSourceReport] = useState<SourceReport[]>([]);
  const [totalDurationMs, setTotalDurationMs] = useState(0);
  const [history, setHistory] = useState<SearchSnapshot[]>(() => {
    try {
      const saved = localStorage.getItem("devpulse_docsearch_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const telemetry = useMemo(() => {
    if (history.length === 0) return [] as Array<{ source: string; avgDurationMs: number; successRate: number; avgResults: number }>;
    const grouped = new Map<string, { durationTotal: number; count: number; nonZeroCount: number; resultsTotal: number }>();
    history.forEach((entry) => {
      entry.sourceReport.forEach((row) => {
        const prev = grouped.get(row.source) || { durationTotal: 0, count: 0, nonZeroCount: 0, resultsTotal: 0 };
        prev.durationTotal += row.durationMs;
        prev.count += 1;
        if (row.count > 0) prev.nonZeroCount += 1;
        prev.resultsTotal += row.count;
        grouped.set(row.source, prev);
      });
    });
    return [...grouped.entries()].map(([source, value]) => ({
      source,
      avgDurationMs: Math.round(value.durationTotal / value.count),
      successRate: Math.round((value.nonZeroCount / value.count) * 100),
      avgResults: Number((value.resultsTotal / value.count).toFixed(2)),
    }));
  }, [history]);

  const exportSearchReport = (format: "json" | "csv") => {
    if (!hasSearched) return;
    const now = new Date().toISOString();
    if (format === "json") {
      const payload = {
        query,
        generatedAt: now,
        summary: {
          resultCount: results.length,
          totalDurationMs,
        },
        sourceReport,
        telemetry,
        results,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `doc-search-report-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    const header = ["source", "count", "duration_ms"];
    const rows = sourceReport.map((row) => [row.source, String(row.count), String(row.durationMs)]);
    const csv = [header.join(","), ...rows.map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `doc-search-sources-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setHasSearched(true);

    const started = performance.now();
    const settled = await Promise.all([
      timedSearch("Wikipedia", () => searchWikipedia(query)),
      timedSearch("Semantic Scholar", () => searchSemanticScholar(query)),
      timedSearch("DuckDuckGo", () => searchDuckDuckGo(query)),
      timedSearch("Crossref", () => searchCrossref(query)),
    ]);

    const merged = dedupeResults(
      settled.flatMap((entry) => (entry.result ? (entry.result as DocResult[]) : []))
    );

    setResults(merged);
    setSourceReport(
      settled.map((entry) => ({
        source: entry.label,
        count: entry.result ? (entry.result as DocResult[]).length : 0,
        durationMs: entry.durationMs,
      }))
    );
    const duration = Math.round(performance.now() - started);
    setTotalDurationMs(duration);
    const snapshot: SearchSnapshot = {
      at: new Date().toISOString(),
      totalDurationMs: duration,
      sourceReport: settled.map((entry) => ({
        source: entry.label,
        count: entry.result ? (entry.result as DocResult[]).length : 0,
        durationMs: entry.durationMs,
      })),
      resultCount: merged.length,
    };
    setHistory((prev) => {
      const next = [snapshot, ...prev].slice(0, 25);
      localStorage.setItem("devpulse_docsearch_history", JSON.stringify(next));
      return next;
    });
    setIsSearching(false);
  };

  return (
    <section id="docs" className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 text-center"
        >
          <div className="flex items-center gap-3 justify-center mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Search className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
              Live <span className="text-primary">Doc Search</span>
            </h2>
          </div>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto font-light">
            Searches live public knowledge sources and shows real-time source-by-source report metrics.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative mb-8"
        >
          <div className="glass-card gradient-border rounded-2xl flex items-center overflow-hidden float-card">
            <Search className="w-5 h-5 text-muted-foreground ml-5" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleSearch()}
              placeholder="Search docs, papers, APIs, libraries..."
              className="flex-1 px-4 py-4 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-lg"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-6 py-4 bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-colors"
            >
              {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : "Search"}
            </button>
          </div>
        </motion.div>

        {hasSearched && (
          <div className="glass-card rounded-xl p-4 border border-border mb-6">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Live Search Report</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportSearchReport("csv")}
                  className="px-2 py-1 rounded-md text-xs glass-card text-muted-foreground hover:text-foreground"
                >
                  CSV
                </button>
                <button
                  onClick={() => exportSearchReport("json")}
                  className="px-2 py-1 rounded-md text-xs glass-card text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> JSON
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-mono mb-2">
              Total results: {results.length} · Query time: {totalDurationMs}ms
            </p>
            <div className="flex flex-wrap gap-2">
              {sourceReport.map((row) => (
                <span key={row.source} className="px-2 py-1 rounded-md bg-muted/20 text-xs font-mono text-muted-foreground">
                  {row.source}: {row.count} ({row.durationMs}ms)
                </span>
              ))}
            </div>
            {telemetry.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest mb-2">Source Telemetry (last {history.length} searches)</p>
                <div className="flex flex-wrap gap-2">
                  {telemetry.map((item) => (
                    <span key={item.source} className="px-2 py-1 rounded-md bg-muted/20 text-xs font-mono text-muted-foreground">
                      {item.source}: {item.successRate}% success · {item.avgDurationMs}ms avg · {item.avgResults} results
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          {isSearching ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Searching live sources...</p>
            </motion.div>
          ) : (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {results.map((result, index) => (
                <motion.a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={`${result.url}-${index}`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="block glass-card-hover gradient-border rounded-xl p-5"
                >
                  <div className="flex items-start gap-3">
                    <result.icon className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-primary/60">{result.source}</span>
                      </div>
                      <h3 className="font-semibold text-foreground mb-1">{result.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{result.snippet}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </motion.a>
              ))}
              {hasSearched && results.length === 0 && !isSearching && (
                <p className="text-center text-muted-foreground py-12">No live results found for this query.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
