"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { GitBranch, ArrowRight, Zap } from "lucide-react";
import { useHealthStore } from "@/hooks/useHealthStore";

/**
 * Compute LIVE compatibility score from base score + current health of both APIs.
 * Both healthy = full score, one degraded = -15%, one down = -40%.
 */
function statusPenalty(status: string | undefined): number {
  const statusPenalty: Record<string, number> = {
    healthy: 0,
    degraded: 15,
    down: 40,
    unknown: 25,
  };
  return statusPenalty[status || "unknown"] ?? 25;
}

function latencyPenalty(latencyMs?: number): number {
  if (!latencyMs || latencyMs <= 0) return 25;
  if (latencyMs < 300) return 0;
  if (latencyMs < 800) return 8;
  if (latencyMs < 1500) return 15;
  return 25;
}

type LiveEdge = {
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  reason: string;
  liveScore: number;
};

export default function CompatibilityGraph() {
  const [selectedApi, setSelectedApi] = useState<string | null>(null);
  const { metrics } = useHealthStore();

  const metricsByApiId = useMemo(() => {
    const map: Record<string, { status: string; latencyMs: number }> = {};
    metrics.forEach((m) => {
      map[m.apiId] = { status: m.status, latencyMs: m.latencyMs };
    });
    return map;
  }, [metrics]);

  const connections = useMemo<LiveEdge[]>(() => {
    const activeIds = metrics.map((m) => m.apiId);
    if (activeIds.length < 2) return [];

    const edges: LiveEdge[] = [];
    for (let i = 0; i < activeIds.length; i++) {
      for (let j = i + 1; j < activeIds.length; j++) {
        const sid = activeIds[i];
        const tid = activeIds[j];
        if (selectedApi && sid !== selectedApi && tid !== selectedApi) continue;

        const sourceMetric = metricsByApiId[sid];
        const targetMetric = metricsByApiId[tid];
        const sourceName = metrics.find((m) => m.apiId === sid)?.apiName ?? sid;
        const targetName = metrics.find((m) => m.apiId === tid)?.apiName ?? tid;
        const categoryBonus = 8;
        const score = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              100 -
              Math.max(statusPenalty(sourceMetric.status), statusPenalty(targetMetric.status)) -
              Math.round((latencyPenalty(sourceMetric.latencyMs) + latencyPenalty(targetMetric.latencyMs)) / 2) +
              categoryBonus
            )
          )
        );

        const reason = `Pairing ${sourceName} + ${targetName} scored from live uptime and latency.`;

        edges.push({
          source: sid,
          target: tid,
          sourceName,
          targetName,
          reason,
          liveScore: score,
        });
      }
    }

    return edges.sort((a, b) => b.liveScore - a.liveScore).slice(0, 12);
  }, [selectedApi, metricsByApiId, metrics]);

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-status-healthy";
    if (score >= 60) return "text-secondary";
    if (score >= 40) return "text-status-degraded";
    return "text-status-down";
  };

  const scoreBorderColor = (score: number) => {
    if (score >= 80) return "border-status-healthy/15";
    if (score >= 60) return "border-secondary/15";
    if (score >= 40) return "border-status-degraded/15";
    return "border-status-down/15";
  };

  const scoreBarColor = (score: number) => {
    if (score >= 80) return "bg-status-healthy";
    if (score >= 60) return "bg-secondary";
    return "bg-status-degraded";
  };

  return (
    <section id="compatibility" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-secondary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
              Compatibility <span className="text-secondary">Graph</span>
            </h2>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl font-light flex items-center gap-2">
            Live compatibility scores based on real probe status and latency. Select an API to see its strongest live pairings.
            {metrics.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-primary/80 font-mono">
                <Zap className="w-3 h-3" /> Live
              </span>
            )}
          </p>
        </motion.div>

        {/* API selector */}
        <div className="flex flex-wrap gap-2 mb-10">
          <button
            onClick={() => setSelectedApi(null)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              !selectedApi ? "bg-secondary/15 text-secondary border border-secondary/25" : "glass-card text-muted-foreground hover:text-foreground"
            }`}
          >
            All Connections
          </button>
          {metrics.map((m) => (
            <button
              key={m.apiId}
              onClick={() => setSelectedApi(m.apiId === selectedApi ? null : m.apiId)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedApi === m.apiId
                  ? "bg-secondary/15 text-secondary border border-secondary/25"
                  : "glass-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.apiName}
            </button>
          ))}
        </div>

        {/* Connections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((edge, i) => {
            return (
              <motion.div
                key={`${edge.source}-${edge.target}`}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="card-3d"
              >
                <div className={`card-3d-inner glass-card-hover rounded-xl p-5 border ${scoreBorderColor(edge.liveScore)}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-foreground">{edge.sourceName}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">{edge.targetName}</span>
                    </div>
                    <span className={`text-2xl font-bold font-mono ${scoreColor(edge.liveScore)}`}>
                      {edge.liveScore}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{edge.reason}</p>
                  <div className="mt-3 w-full h-1.5 rounded-full bg-muted/20">
                    <motion.div
                      className={`h-full rounded-full ${scoreBarColor(edge.liveScore)}`}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${edge.liveScore}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {connections.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            Run live probes to generate compatibility data.
          </div>
        )}
      </div>
    </section>
  );
}
