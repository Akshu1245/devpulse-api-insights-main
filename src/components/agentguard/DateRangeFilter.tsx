import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onRangeChange: (start: string, end: string) => void;
}

const presets = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: 365 },
];

export default function DateRangeFilter({ onRangeChange }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("Last 30 days");

  const handleSelect = (preset: typeof presets[0]) => {
    setSelected(preset.label);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - preset.days);
    onRangeChange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-card text-xs text-muted-foreground hover:text-foreground transition-colors border border-border"
      >
        <Calendar className="w-3 h-3" />
        {selected}
        <ChevronDown className="w-3 h-3" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute right-0 top-9 z-50 glass-card rounded-xl border border-border shadow-xl overflow-hidden min-w-[160px]"
          >
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => handleSelect(p)}
                className={`w-full text-left px-4 py-2.5 text-xs hover:bg-muted/30 transition-colors ${
                  selected === p.label ? "text-primary bg-primary/5" : "text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
