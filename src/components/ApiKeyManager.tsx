"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Key, Plus, Trash2, Eye, EyeOff, X, Shield } from "lucide-react";

export interface UserApiKey {
  id: string;
  name: string;
  key: string;
  apiId: string;
}

const SUPPORTED_APIS = [
  { id: "openweather", name: "OpenWeather", placeholder: "Enter your OpenWeather API key" },
  { id: "nasa", name: "NASA", placeholder: "Enter your NASA API key" },
  { id: "opencage", name: "OpenCage Geocoder", placeholder: "Enter your OpenCage API key" },
  { id: "newsapi", name: "News API", placeholder: "Enter your News API key" },
  { id: "omdb", name: "OMDb", placeholder: "Enter your OMDb API key" },
  { id: "custom", name: "Custom API", placeholder: "Enter your API key" },
];

interface Props {
  apiKeys: UserApiKey[];
  onAddKey: (key: UserApiKey) => Promise<void> | void;
  onRemoveKey: (id: string) => Promise<void> | void;
  isOpen: boolean;
  onClose: () => void;
}

export default function ApiKeyManager({ apiKeys, onAddKey, onRemoveKey, isOpen, onClose }: Props) {
  const [selectedApi, setSelectedApi] = useState(SUPPORTED_APIS[0].id);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => isOpen && e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);
  const [keyValue, setKeyValue] = useState("");
  const [customName, setCustomName] = useState("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const handleAdd = async () => {
    if (!keyValue.trim()) return;
    const api = SUPPORTED_APIS.find(a => a.id === selectedApi);
    const name = selectedApi === "custom" ? customName.trim() || "Custom API" : api?.name || selectedApi;
    await onAddKey({
      id: `${selectedApi}-${Date.now()}`,
      name,
      key: keyValue.trim(),
      apiId: selectedApi,
    });
    setKeyValue("");
    setCustomName("");
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return key.slice(0, 4) + "••••••••" + key.slice(-4);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="relative glass-card gradient-border rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto float-card"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Key className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground font-serif">API Key Manager</h3>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-start gap-2 mb-6 p-3 rounded-xl bg-status-degraded/5 border border-status-degraded/10">
              <Shield className="w-4 h-4 text-status-degraded mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Keys are stored in your authenticated workspace and used only for live health probes.
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <select
                value={selectedApi}
                onChange={e => setSelectedApi(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm outline-none focus:border-primary/30 transition-colors"
              >
                {SUPPORTED_APIS.map(api => (
                  <option key={api.id} value={api.id}>{api.name}</option>
                ))}
              </select>

              {selectedApi === "custom" && (
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="API name (e.g., Stripe)"
                  maxLength={50}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm outline-none focus:border-primary/30 transition-colors placeholder:text-muted-foreground"
                />
              )}

              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyValue}
                  onChange={e => setKeyValue(e.target.value)}
                  placeholder={SUPPORTED_APIS.find(a => a.id === selectedApi)?.placeholder}
                  maxLength={200}
                  onKeyDown={e => e.key === "Enter" && void handleAdd()}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm font-mono outline-none focus:border-primary/30 transition-colors placeholder:text-muted-foreground placeholder:font-sans"
                />
                <button
                  onClick={() => void handleAdd()}
                  disabled={!keyValue.trim()}
                  className="px-4 py-2.5 rounded-xl bg-primary/15 text-primary font-medium text-sm hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                Saved Keys ({apiKeys.length})
              </h4>
              {apiKeys.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No API keys added yet. Add one above to start monitoring.
                </p>
              )}
              {apiKeys.map(ak => (
                <motion.div
                  key={ak.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/15 border border-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{ak.name}</p>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      {showKeys[ak.id] ? ak.key : maskKey(ak.key)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    <button
                      onClick={() => setShowKeys(prev => ({ ...prev, [ak.id]: !prev[ak.id] }))}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all"
                    >
                      {showKeys[ak.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => void onRemoveKey(ak.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-status-down hover:bg-status-down/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
