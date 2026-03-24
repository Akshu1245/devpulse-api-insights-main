"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Shield, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";

const links = [
  { label: "Dashboard", href: "#dashboard" },
  { label: "API Security", href: "/devpulse/security", route: true as const },
  { label: "Compatibility", href: "#compatibility" },
  { label: "Code Gen", href: "#codegen" },
  { label: "Doc Search", href: "#docs" },
  { label: "AgentGuard", href: "#agentguard", primary: true },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-border/30"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="text-lg font-serif font-bold text-foreground tracking-tight">
            Dev<span className="text-primary">Pulse</span>
          </span>
        </a>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {links.map(l =>
            l.primary ? (
              <Link
                key={l.href}
                to={l.href}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/90 px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/15 transition-all duration-200"
              >
                <Shield className="w-4 h-4" />
                {l.label}
              </Link>
            ) : "route" in l && l.route ? (
              <Link
                key={l.href}
                to={l.href}
                className="text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg hover:bg-muted/30 transition-all duration-200"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg hover:bg-muted/30 transition-all duration-200"
              >
                {l.label}
              </a>
            )
          )}
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setOpen(!open)} className="md:hidden text-foreground p-2 rounded-lg hover:bg-muted/30 transition-colors">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="md:hidden border-t border-border/30 px-6 pb-4"
        >
          {links.map(l =>
            l.primary ? (
              <Link
                key={l.href}
                to={l.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 py-3 text-sm font-medium text-primary"
              >
                <Shield className="w-4 h-4" />
                {l.label}
              </Link>
            ) : "route" in l && l.route ? (
              <Link
                key={l.href}
                to={l.href}
                onClick={() => setOpen(false)}
                className="block py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {l.label}
              </a>
            )
          )}
        </motion.div>
      )}
    </motion.nav>
  );
}
