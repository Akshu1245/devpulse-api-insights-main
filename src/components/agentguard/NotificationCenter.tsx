import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, AlertTriangle, DollarSign, Shield, Radio, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Alert = {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

interface Props {
  alerts: Alert[];
  onRefresh: () => void;
}

const alertIcons: Record<string, typeof AlertTriangle> = {
  cost_limit: DollarSign,
  loop_detected: Radio,
  key_leak: Shield,
  rate_limit: AlertTriangle,
  error: AlertTriangle,
};

const severityColors: Record<string, string> = {
  critical: "text-status-down",
  warning: "text-status-degraded",
  info: "text-status-info",
};

export default function NotificationCenter({ alerts, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = alerts.filter(a => !a.is_read).length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAsRead = async (id: string) => {
    await supabase.from("alerts").update({ is_read: true }).eq("id", id);
    onRefresh();
  };

  const markAllRead = async () => {
    const unreadIds = alerts.filter(a => !a.is_read).map(a => a.id);
    if (unreadIds.length === 0) return;
    for (const id of unreadIds) {
      await supabase.from("alerts").update({ is_read: true }).eq("id", id);
    }
    onRefresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative p-1.5 rounded-lg hover:bg-muted/30 transition-colors">
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-status-down text-[10px] text-foreground flex items-center justify-center font-mono min-w-[18px] h-[18px]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 w-80 sm:w-96 glass-card rounded-xl border border-border shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-[10px] text-primary hover:underline">
                    Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)}>
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No notifications yet
                </div>
              ) : (
                alerts.slice(0, 15).map((alert) => {
                  const Icon = alertIcons[alert.alert_type] || AlertTriangle;
                  const color = severityColors[alert.severity] || "text-muted-foreground";
                  return (
                    <div
                      key={alert.id}
                      className={`px-4 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors ${!alert.is_read ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-medium text-foreground truncate">{alert.title}</h4>
                            {!alert.is_read && (
                              <button onClick={() => markAsRead(alert.id)} className="shrink-0">
                                <Check className="w-3 h-3 text-muted-foreground hover:text-primary" />
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{alert.message}</p>
                          <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">
                            {new Date(alert.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
