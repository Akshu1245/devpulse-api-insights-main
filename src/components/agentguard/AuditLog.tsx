import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { ScrollText, Loader2 } from "lucide-react";

type AuditEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  agent_id: string | null;
};

interface Props {
  userId: string;
}

export default function AuditLog({ userId }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("audit_log")
        .select("id, action, details, created_at, agent_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setEntries(data as AuditEntry[]);
      setLoading(false);
    }
    fetch();
  }, [userId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  if (entries.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border border-border">
        <ScrollText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No audit entries</h3>
        <p className="text-muted-foreground">All configuration changes and security events will be logged here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold font-serif text-foreground">Audit Log</h3>
      <div className="glass-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-4 text-muted-foreground font-medium">Time</th>
              <th className="text-left p-4 text-muted-foreground font-medium">Action</th>
              <th className="text-left p-4 text-muted-foreground font-medium hidden md:table-cell">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <motion.tr
                key={entry.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="border-b border-border/30 last:border-0"
              >
                <td className="p-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleString()}
                </td>
                <td className="p-4 text-foreground font-medium">
                  <span className="px-2 py-0.5 rounded-lg bg-muted/30 text-xs font-mono">{entry.action}</span>
                </td>
                <td className="p-4 text-xs text-muted-foreground font-mono hidden md:table-cell max-w-xs truncate">
                  {JSON.stringify(entry.details).slice(0, 100)}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
