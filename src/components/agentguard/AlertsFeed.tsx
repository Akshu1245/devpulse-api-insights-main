import { motion } from "framer-motion";
import { AlertTriangle, ShieldAlert, Repeat, DollarSign, Zap, RefreshCw, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Alert = {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  agent_id: string | null;
};

interface Props {
  alerts: Alert[];
  onRefresh: () => void;
}

const alertIcons: Record<string, typeof AlertTriangle> = {
  cost_limit: DollarSign,
  loop_detected: Repeat,
  key_leak: ShieldAlert,
  rate_limit: Zap,
  error: AlertTriangle,
};

const severityStyles: Record<string, { border: string; text: string }> = {
  critical: { border: "border-status-down/30", text: "text-status-down" },
  warning: { border: "border-status-degraded/30", text: "text-status-degraded" },
  info: { border: "border-secondary/30", text: "text-secondary" },
};

export default function AlertsFeed({ alerts, onRefresh }: Props) {
  const markRead = async (id: string) => {
    await supabase.from("alerts").update({ is_read: true }).eq("id", id);
    onRefresh();
  };

  if (alerts.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border border-border">
        <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No alerts</h3>
        <p className="text-muted-foreground">Your agents are running smoothly. Alerts will appear here for cost overruns, loops, and key leaks.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold font-serif text-foreground">Recent Alerts</h3>
        <button onClick={onRefresh} className="text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {alerts.map((alert, i) => {
        const Icon = alertIcons[alert.alert_type] || AlertTriangle;
        const style = severityStyles[alert.severity] || severityStyles.info;
        return (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`glass-card rounded-xl p-4 border ${style.border} ${alert.is_read ? "opacity-60" : ""}`}
          >
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 mt-0.5 ${style.text} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-foreground text-sm">{alert.title}</h4>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${style.text} bg-muted/30`}>
                    {alert.severity}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{alert.message}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(alert.created_at).toLocaleString()}
                  </span>
                  {!alert.is_read && (
                    <button
                      onClick={() => markRead(alert.id)}
                      className="text-[10px] text-primary hover:underline font-medium"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
