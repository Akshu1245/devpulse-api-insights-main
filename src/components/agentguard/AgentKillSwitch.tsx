import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Power, AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  agentId: string;
  agentName: string;
  userId: string;
  onKilled: () => void;
}

export default function AgentKillSwitch({ agentId, agentName, userId, onKilled }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [killing, setKilling] = useState(false);
  const { toast } = useToast();

  const handleKill = async () => {
    setKilling(true);
    const { error } = await supabase.from("agents").update({ status: "stopped" }).eq("id", agentId);
    
    if (!error) {
      await supabase.from("alerts").insert({
        user_id: userId,
        agent_id: agentId,
        alert_type: "error",
        severity: "critical",
        title: "Agent killed via kill switch",
        message: `Agent "${agentName}" was manually stopped via the emergency kill switch.`,
      });

      await supabase.from("audit_log").insert({
        user_id: userId,
        agent_id: agentId,
        action: "kill_switch_activated",
        details: { agent_name: agentName },
      });

      toast({ title: "Agent stopped", description: `${agentName} has been killed.` });
      onKilled();
    }
    
    setKilling(false);
    setConfirming(false);
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-down/10 text-status-down text-xs font-medium hover:bg-status-down/20 transition-colors"
      >
        <Power className="w-3 h-3" />
        Kill
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-status-down" />
      <span className="text-xs text-status-down">Kill agent?</span>
      <button
        onClick={handleKill}
        disabled={killing}
        className="px-2 py-1 rounded-lg bg-status-down text-foreground text-xs font-medium disabled:opacity-50"
      >
        {killing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
      </button>
      <button onClick={() => setConfirming(false)} className="text-xs text-muted-foreground hover:text-foreground">
        No
      </button>
    </motion.div>
  );
}
