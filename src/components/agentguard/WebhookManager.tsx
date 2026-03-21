import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Webhook, Plus, Trash2, ToggleLeft, ToggleRight, Loader2, Globe, MessageSquare, Mail, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const PRIVATE_IP_PATTERNS = [/^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^169\.254\./, /^localhost$/i, /^.*\.local$/i, /^::1$/];

const validateWebhookUrl = (url: string): { valid: boolean; reason?: string } => {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, reason: "Only HTTP/HTTPS allowed" };
    }
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(parsed.hostname)) {
        return { valid: false, reason: "Private IPs not allowed" };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }
};

type WebhookConfig = {
  id: string;
  name: string;
  url: string;
  webhook_type: string;
  events: string[];
  is_active: boolean;
  created_at: string;
};

const WEBHOOK_TYPES = [
  { id: "slack", label: "Slack", icon: MessageSquare },
  { id: "discord", label: "Discord", icon: Globe },
  { id: "email", label: "Email (Zapier/IFTTT)", icon: Mail },
];

const EVENT_TYPES = [
  "cost_limit",
  "loop_detected",
  "key_leak",
  "rate_limit",
  "error",
  "agent_stopped",
];

interface Props {
  userId: string;
}

export default function WebhookManager({ userId }: Props) {
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("slack");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["cost_limit", "key_leak"]);
  const [saving, setSaving] = useState(false);
  const [urlValidation, setUrlValidation] = useState<{ valid: boolean; reason?: string } | null>(null);

  useEffect(() => {
    fetchWebhooks();
  }, [userId]);

  const fetchWebhooks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("webhook_configs")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setWebhooks(data as WebhookConfig[]);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!name || !url) return;
    
    const urlValidation = validateWebhookUrl(url);
    if (!urlValidation.valid) {
      toast({ 
        title: "Invalid URL", 
        description: urlValidation.reason, 
        variant: "destructive" 
      });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("webhook_configs").insert({
      user_id: userId,
      name,
      url,
      webhook_type: type,
      events: selectedEvents,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Webhook added" });
      setName("");
      setUrl("");
      setShowAdd(false);
      fetchWebhooks();
    }
    setSaving(false);
  };

  const handleToggle = async (wh: WebhookConfig) => {
    await supabase.from("webhook_configs").update({ is_active: !wh.is_active }).eq("id", wh.id);
    fetchWebhooks();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("webhook_configs").delete().eq("id", id);
    toast({ title: "Webhook deleted" });
    fetchWebhooks();
  };

  const toggleEvent = (e: string) => {
    setSelectedEvents((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold font-serif text-foreground">Webhook Alerts</h3>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Add Webhook
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card rounded-xl p-6 border border-border space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Security Slack Channel"
                  className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Webhook URL</label>
                <input
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (e.target.value) {
                      setUrlValidation(validateWebhookUrl(e.target.value));
                    } else {
                      setUrlValidation(null);
                    }
                  }}
                  placeholder="https://hooks.slack.com/services/..."
                  className={`w-full px-4 py-2.5 rounded-xl bg-muted/30 border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                    urlValidation === null ? 'border-border' : urlValidation.valid ? 'border-status-healthy' : 'border-destructive'
                  }`}
                />
                {urlValidation && !urlValidation.valid && (
                  <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                    <AlertTriangle className="w-3 h-3" /> {urlValidation.reason}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Type</label>
              <div className="flex gap-2">
                {WEBHOOK_TYPES.map((wt) => (
                  <button
                    key={wt.id}
                    onClick={() => setType(wt.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
                      type === wt.id
                        ? "bg-primary/15 text-primary border border-primary/25"
                        : "glass-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <wt.icon className="w-4 h-4" />
                    {wt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Events</label>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map((ev) => (
                  <button
                    key={ev}
                    onClick={() => toggleEvent(ev)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                      selectedEvents.includes(ev)
                        ? "bg-primary/15 text-primary border border-primary/25"
                        : "bg-muted/20 text-muted-foreground border border-border"
                    }`}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAdd}
              disabled={saving || !name || !url}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Save Webhook
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {webhooks.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border border-border">
          <Webhook className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No webhooks configured</h3>
          <p className="text-muted-foreground text-sm">Add a Slack, Discord, or email webhook to receive real-time security alerts.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => {
            const typeInfo = WEBHOOK_TYPES.find((t) => t.id === wh.webhook_type);
            const TypeIcon = typeInfo?.icon || Globe;
            return (
              <motion.div
                key={wh.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-4 border border-border flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${wh.is_active ? "bg-primary/15" : "bg-muted/20"}`}>
                    <TypeIcon className={`w-4 h-4 ${wh.is_active ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{wh.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{wh.url}</p>
                    <div className="flex gap-1 mt-1">
                      {wh.events.map((ev) => (
                        <span key={ev} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggle(wh)} className="text-muted-foreground hover:text-foreground transition-colors">
                    {wh.is_active ? (
                      <ToggleRight className="w-6 h-6 text-status-healthy" />
                    ) : (
                      <ToggleLeft className="w-6 h-6" />
                    )}
                  </button>
                  <button onClick={() => handleDelete(wh.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
