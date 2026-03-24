"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Search, Plus, Trash2, Edit3, Check, ToggleLeft, ToggleRight,
  Globe, Settings2, ChevronDown, ChevronUp
} from "lucide-react";
import { type APIInfo } from "@/data/apiData";

export interface CustomAPI extends APIInfo {
  isCustom: true;
}

interface Props {
  builtInApis: APIInfo[];
  customApis: CustomAPI[];
  disabledApiIds: Set<string>;
  onToggleApi: (id: string) => void;
  onRemoveCustomApi: (id: string) => void;
  onAddCustomApi: (api: CustomAPI) => void;
  onEditCustomApi: (api: CustomAPI) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function ApiRegistryManager({
  builtInApis, customApis, disabledApiIds, onToggleApi,
  onRemoveCustomApi, onAddCustomApi, onEditCustomApi,
  isOpen, onClose
}: Props) {
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => isOpen && e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<"builtin" | "custom" | null>("builtin");

  // Add form state
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTestUrl, setNewTestUrl] = useState("");
  const [newRequiresKey, setNewRequiresKey] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTestUrl, setEditTestUrl] = useState("");
  const [editRequiresKey, setEditRequiresKey] = useState(false);

  const allApis = useMemo(() => [...builtInApis, ...customApis], [builtInApis, customApis]);

  const filteredBuiltIn = useMemo(() => {
    if (!search.trim()) return builtInApis;
    const q = search.toLowerCase();
    return builtInApis.filter(a =>
      a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    );
  }, [builtInApis, search]);

  const filteredCustom = useMemo(() => {
    if (!search.trim()) return customApis;
    const q = search.toLowerCase();
    return customApis.filter(a =>
      a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    );
  }, [customApis, search]);

  const enabledCount = allApis.filter(a => !disabledApiIds.has(a.id)).length;

  const handleAdd = () => {
    if (!newName.trim() || !newTestUrl.trim()) return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onAddCustomApi({
      id,
      name: newName.trim(),
      category: newCategory.trim() || "Custom",
      description: newDescription.trim() || "User-added API",
      requiresKey: newRequiresKey,
      testUrl: newTestUrl.trim(),
      isCustom: true,
    });
    setNewName(""); setNewCategory(""); setNewDescription(""); setNewTestUrl(""); setNewRequiresKey(false);
    setShowAddForm(false);
  };

  const startEdit = (api: CustomAPI) => {
    setEditingId(api.id);
    setEditName(api.name);
    setEditCategory(api.category);
    setEditDescription(api.description);
    setEditTestUrl(api.testUrl);
    setEditRequiresKey(api.requiresKey);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim() || !editTestUrl.trim()) return;
    onEditCustomApi({
      id: editingId,
      name: editName.trim(),
      category: editCategory.trim() || "Custom",
      description: editDescription.trim() || "User-added API",
      requiresKey: editRequiresKey,
      testUrl: editTestUrl.trim(),
      isCustom: true,
    });
    setEditingId(null);
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
            className="relative glass-card gradient-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto float-card"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Settings2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground font-serif">API Registry</h3>
                  <p className="text-xs text-muted-foreground">{enabledCount} of {allApis.length} APIs enabled</p>
                </div>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search APIs..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm outline-none focus:border-primary/30 transition-colors placeholder:text-muted-foreground"
              />
            </div>

            {/* Built-in APIs Section */}
            <div className="mb-4">
              <button
                onClick={() => setExpandedSection(expandedSection === "builtin" ? null : "builtin")}
                className="flex items-center justify-between w-full text-left mb-3"
              >
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5" />
                  Built-in APIs ({filteredBuiltIn.length})
                </h4>
                {expandedSection === "builtin" ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              <AnimatePresence>
                {expandedSection === "builtin" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1.5 overflow-hidden"
                  >
                    {filteredBuiltIn.map(api => {
                      const enabled = !disabledApiIds.has(api.id);
                      return (
                        <div
                          key={api.id}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                            enabled
                              ? "bg-muted/10 border-border/50"
                              : "bg-muted/5 border-border/20 opacity-50"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                                {api.name}
                              </p>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                                {api.category}
                              </span>
                              {api.requiresKey && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-status-degraded/10 text-status-degraded">
                                  KEY
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{api.description}</p>
                          </div>
                          <button
                            onClick={() => onToggleApi(api.id)}
                            className="ml-3 shrink-0"
                          >
                            {enabled ? (
                              <ToggleRight className="w-6 h-6 text-primary" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Custom APIs Section */}
            <div className="mb-4">
              <button
                onClick={() => setExpandedSection(expandedSection === "custom" ? null : "custom")}
                className="flex items-center justify-between w-full text-left mb-3"
              >
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5" />
                  Your Custom APIs ({filteredCustom.length})
                </h4>
                {expandedSection === "custom" ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              <AnimatePresence>
                {expandedSection === "custom" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    {filteredCustom.map(api => (
                      <div key={api.id}>
                        {editingId === api.id ? (
                          <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="API Name" maxLength={60}
                              className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm text-foreground outline-none focus:border-primary/30 placeholder:text-muted-foreground" />
                            <div className="flex gap-2">
                              <input value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="Category" maxLength={30}
                                className="flex-1 px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm text-foreground outline-none focus:border-primary/30 placeholder:text-muted-foreground" />
                              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                                <input type="checkbox" checked={editRequiresKey} onChange={e => setEditRequiresKey(e.target.checked)} className="accent-primary" />
                                Key
                              </label>
                            </div>
                            <input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description" maxLength={100}
                              className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm text-foreground outline-none focus:border-primary/30 placeholder:text-muted-foreground" />
                            <input value={editTestUrl} onChange={e => setEditTestUrl(e.target.value)} placeholder="Test URL (GET endpoint)" maxLength={500}
                              className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm font-mono text-foreground outline-none focus:border-primary/30 placeholder:text-muted-foreground placeholder:font-sans" />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                              <button onClick={saveEdit} disabled={!editName.trim() || !editTestUrl.trim()}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors disabled:opacity-40">
                                <Check className="w-3 h-3" /> Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/50">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{api.name}</p>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{api.category}</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{api.testUrl}</p>
                            </div>
                            <div className="flex items-center gap-1 ml-3">
                              <button
                                onClick={() => onToggleApi(api.id)}
                                className="shrink-0"
                              >
                                {!disabledApiIds.has(api.id) ? (
                                  <ToggleRight className="w-5 h-5 text-primary" />
                                ) : (
                                  <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                                )}
                              </button>
                              <button onClick={() => startEdit(api)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => onRemoveCustomApi(api.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-status-down hover:bg-status-down/10 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {filteredCustom.length === 0 && !showAddForm && (
                      <p className="text-sm text-muted-foreground text-center py-4">No custom APIs yet.</p>
                    )}

                    {/* Add Form */}
                    <AnimatePresence>
                      {showAddForm ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2 overflow-hidden"
                        >
                          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="API Name *" maxLength={60}
                            className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm text-foreground outline-none focus:border-primary/30 placeholder:text-muted-foreground" />
                          <div className="flex gap-2">
                            <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="Category (e.g. Finance)" maxLength={30}
                              className="flex-1 px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm text-foreground outline-none focus:border-primary/30 placeholder:text-muted-foreground" />
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                              <input type="checkbox" checked={newRequiresKey} onChange={e => setNewRequiresKey(e.target.checked)} className="accent-primary" />
                              Requires Key
                            </label>
                          </div>
                          <input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Short description" maxLength={100}
                            className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm text-foreground outline-none focus:border-primary/30 placeholder:text-muted-foreground" />
                          <input value={newTestUrl} onChange={e => setNewTestUrl(e.target.value)} placeholder="Test URL (GET endpoint) *" maxLength={500}
                            onKeyDown={e => e.key === "Enter" && handleAdd()}
                            className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm font-mono text-foreground outline-none focus:border-primary/30 placeholder:text-muted-foreground placeholder:font-sans" />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                            <button onClick={handleAdd} disabled={!newName.trim() || !newTestUrl.trim()}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors disabled:opacity-40">
                              <Plus className="w-3 h-3" /> Add API
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <button
                          onClick={() => { setShowAddForm(true); setExpandedSection("custom"); }}
                          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border/50 text-sm text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
                        >
                          <Plus className="w-4 h-4" />
                          Add Custom API
                        </button>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
