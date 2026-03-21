import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Pause, Play, Trash2, WifiOff, RefreshCw } from "lucide-react";

const MAX_LOG_ENTRIES = 100;
const RECONNECT_DELAY_MS = 3000;
const CHANNEL_NAME = "realtime-agent-logs";

type LogEntry = {
  id: string;
  agent_id: string;
  action_type: string;
  provider: string | null;
  model: string | null;
  cost: number | null;
  step_number: number;
  latency_ms: number | null;
  is_loop_detected: boolean | null;
  created_at: string;
};

export default function RealtimeMonitor() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const subscribe = useCallback(() => {
    const channel = supabase
      .channel(CHANNEL_NAME)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_logs" },
        (payload) => {
          if (!pausedRef.current) {
            setLogs((prev) =>
              [payload.new as LogEntry, ...prev].slice(0, MAX_LOG_ENTRIES)
            );
          }
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reconnectTimeoutRef.current = setTimeout(() => {
            supabase.removeChannel(channel);
            subscribe();
          }, RECONNECT_DELAY_MS);
        }
      });

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    return subscribe();
  }, [subscribe, retryKey]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${connected ? "text-status-healthy animate-pulse" : "text-muted-foreground"}`} />
          <h3 className="text-lg font-semibold font-serif text-foreground">Live Monitor</h3>
          <span className="text-xs font-mono text-muted-foreground">({logs.length} events)</span>
          {!connected && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
              <WifiOff className="w-3 h-3" />
              Reconnecting...
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {!connected && (
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Reconnect
            </button>
          )}
          <button
            onClick={() => setPaused(!paused)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => setLogs([])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="glass-card rounded-xl border border-border overflow-hidden max-h-[500px] overflow-y-auto">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Radio className="w-8 h-8 mx-auto mb-3 opacity-30" />
            Waiting for agent activity...
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="text-left p-3 text-muted-foreground font-medium">Time</th>
                <th className="text-left p-3 text-muted-foreground font-medium">Action</th>
                <th className="text-left p-3 text-muted-foreground font-medium">Provider</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Cost</th>
                <th className="text-right p-3 text-muted-foreground font-medium">Latency</th>
                <th className="text-center p-3 text-muted-foreground font-medium">Loop</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {logs.map((log) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className={`border-b border-border/30 ${log.is_loop_detected ? "bg-status-down/5" : ""}`}
                  >
                    <td className="p-3 font-mono text-muted-foreground">{new Date(log.created_at).toLocaleTimeString()}</td>
                    <td className="p-3 text-foreground">{log.action_type}</td>
                    <td className="p-3 text-muted-foreground">{log.provider || "—"}</td>
                    <td className="p-3 text-right font-mono text-foreground">{log.cost ? `$${Number(log.cost).toFixed(4)}` : "—"}</td>
                    <td className="p-3 text-right font-mono text-muted-foreground">{log.latency_ms ? `${log.latency_ms}ms` : "—"}</td>
                    <td className="p-3 text-center">{log.is_loop_detected ? <span className="text-status-down">⚠</span> : "—"}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
