import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bot } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: { name: string; description: string; framework: string }) => void;
  /** Max agents allowed for current plan (1 free, 10 pro, 50 team) */
  maxAgents: number;
  /** Current agent count */
  currentAgentCount: number;
}

const frameworks = ["LangChain", "CrewAI", "AutoGPT", "OpenAI Agents", "Custom"];

export default function AddAgentModal({ isOpen, onClose, onAdd, maxAgents, currentAgentCount }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [framework, setFramework] = useState("");
  const atLimit = currentAgentCount >= maxAgents;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || atLimit) return;
    onAdd({ name: name.trim(), description: description.trim(), framework });
    setName("");
    setDescription("");
    setFramework("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-card rounded-2xl border border-border p-6 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold font-serif text-foreground">Add Agent</h3>
                {atLimit && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-status-down/20 text-status-down">
                    Limit reached ({currentAgentCount}/{maxAgents})
                  </span>
                )}
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Agent Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Research Agent"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this agent do?"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Framework</label>
                <div className="flex flex-wrap gap-2">
                  {frameworks.map((fw) => (
                    <button
                      key={fw}
                      type="button"
                      onClick={() => setFramework(fw === framework ? "" : fw)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        framework === fw
                          ? "bg-primary/15 text-primary border border-primary/25"
                          : "bg-muted/30 text-muted-foreground border border-border hover:text-foreground"
                      }`}
                    >
                      {fw}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={atLimit}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {atLimit ? "Upgrade to add more agents" : "Create Agent"}
              </button>
              {atLimit && (
                <p className="text-xs text-muted-foreground text-center">
                  Free: no AgentGuard. Pro: 10 agents. Team: 50 agents. Upgrade to add agents.
                </p>
              )}
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
