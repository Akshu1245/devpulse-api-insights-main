"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Badge, Copy, Check, X } from "lucide-react";
import type { APIHealthMetrics } from "@/data/apiData";

interface Props {
  metrics: APIHealthMetrics[];
  onClose: () => void;
}

type BadgeStyle = "dark" | "light";

function generateBadgeSvg(healthy: number, total: number, style: BadgeStyle = "dark"): string {
  const pct = total > 0 ? Math.round((healthy / total) * 100) : 0;
  const color = pct >= 90 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const label = `${healthy}/${total} APIs`;
  const width = Math.max(120, label.length * 7 + 50);
  const isLight = style === "light";
  const bg = isLight ? "#f8fafc" : "#0f172a";
  const stroke = isLight ? "#e2e8f0" : "#1e293b";
  const textColor = isLight ? "#1e293b" : "#e2e8f0";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20">
  <rect width="${width}" height="20" rx="3" fill="${stroke}"/>
  <rect x="1" y="1" width="${width - 2}" height="18" rx="2" fill="${bg}" stroke="${color}" stroke-width="1.5"/>
  <circle cx="10" cy="10" r="3" fill="${color}"/>
  <text x="20" y="14" fill="${textColor}" font-family="ui-monospace,monospace" font-size="11" font-weight="600">${label}</text>
</svg>`;
}

function generateMarkdown(healthy: number, total: number, svg: string, _style?: BadgeStyle): string {
  const base64 = typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(svg))) : "";
  const dataUrl = `data:image/svg+xml;base64,${base64}`;
  return `[![API Status](${dataUrl})](https://www.devpluse.in)`;
}

function generateHtml(healthy: number, total: number, svg: string, _style?: BadgeStyle): string {
  const base64 = typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(svg))) : "";
  const dataUrl = `data:image/svg+xml;base64,${base64}`;
  return `<a href="https://www.devpluse.in"><img src="${dataUrl}" alt="API Status: ${healthy}/${total} healthy" /></a>`;
}

export default function ApiStatusBadge({ metrics, onClose }: Props) {
  const [copied, setCopied] = useState<"svg" | "md" | "html" | null>(null);
  const [style, setStyle] = useState<BadgeStyle>("dark");
  const healthy = metrics.filter(m => m.status === "healthy").length;
  const total = metrics.length;
  const svg = generateBadgeSvg(healthy, total, style);
  const md = generateMarkdown(healthy, total, svg);
  const html = generateHtml(healthy, total, svg);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const copy = async (text: string, type: "svg" | "md" | "html") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="glass-card rounded-2xl p-6 max-w-md w-full border border-border"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Badge className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground font-serif">API Status Badge</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Add this live badge to your README or docs. It shows your current API health at a glance.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setStyle("dark")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              style === "dark" ? "bg-primary/15 text-primary border border-primary/25" : "glass-card text-muted-foreground hover:text-foreground"
            }`}
          >
            Dark
          </button>
          <button
            onClick={() => setStyle("light")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              style === "light" ? "bg-primary/15 text-primary border border-primary/25" : "glass-card text-muted-foreground hover:text-foreground"
            }`}
          >
            Light
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
            <div className="p-4 rounded-xl bg-muted/20 border border-border inline-block">
              <img
                src={`data:image/svg+xml;base64,${typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(svg))) : ""}`}
                alt={`API Status: ${healthy}/${total} healthy`}
                className="h-5"
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Markdown</p>
            <div className="flex gap-2">
              <pre className="flex-1 text-xs font-mono p-3 rounded-lg bg-muted/30 border border-border overflow-x-auto text-muted-foreground">
                {md}
              </pre>
              <button
                onClick={() => copy(md, "md")}
                className="shrink-0 p-2 rounded-lg glass-card hover:bg-muted/30 transition-colors"
              >
                {copied === "md" ? <Check className="w-4 h-4 text-status-healthy" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">HTML</p>
            <div className="flex gap-2">
              <pre className="flex-1 text-xs font-mono p-3 rounded-lg bg-muted/30 border border-border overflow-x-auto text-muted-foreground overflow-y-auto max-h-20">
                {html}
              </pre>
              <button
                onClick={() => copy(html, "html")}
                className="shrink-0 p-2 rounded-lg glass-card hover:bg-muted/30 transition-colors"
              >
                {copied === "html" ? <Check className="w-4 h-4 text-status-healthy" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
