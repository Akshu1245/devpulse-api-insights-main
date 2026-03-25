"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ── Animated SVG heartbeat line ── */
function HeartbeatLine() {
  const pathRef = useRef<SVGPathElement>(null);
  const [length, setLength] = useState(0);

  useEffect(() => {
    if (pathRef.current) setLength(pathRef.current.getTotalLength());
  }, []);

  return (
    <svg viewBox="0 0 1200 120" className="w-full h-[60px] md:h-[80px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="pulse-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          <stop offset="30%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
          <stop offset="50%" stopColor="hsl(162 70% 44%)" stopOpacity="1" />
          <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Flat baseline */}
      <line x1="0" y1="60" x2="1200" y2="60" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.1" strokeWidth="1" />
      {/* ECG path */}
      <motion.path
        ref={pathRef}
        d="M0,60 L300,60 L340,60 L360,45 L380,60 L420,60 L440,60 L455,85 L470,10 L485,75 L500,55 L520,60 L560,60 L590,48 L620,60 L700,60 L740,60 L760,45 L780,60 L820,60 L840,60 L855,85 L870,10 L885,75 L900,55 L920,60 L960,60 L990,48 L1020,60 L1200,60"
        fill="none"
        stroke="url(#pulse-grad)"
        strokeWidth="2.5"
        filter="url(#glow)"
        initial={{ strokeDasharray: length, strokeDashoffset: length }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: 2.5, delay: 0.8, ease: "easeInOut" }}
      />
    </svg>
  );
}

/* ── Floating status cards ── */
const statusCards = [
  { name: "Stripe API", status: "healthy", latency: "42ms", uptime: "99.98%" },
  { name: "GitHub API", status: "healthy", latency: "89ms", uptime: "99.95%" },
  { name: "OpenAI API", status: "degraded", latency: "340ms", uptime: "99.12%" },
  { name: "AWS S3", status: "healthy", latency: "28ms", uptime: "99.99%" },
];

function StatusCard({ card, index }: { card: typeof statusCards[0]; index: number }) {
  const isHealthy = card.status === "healthy";
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 1.8 + index * 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card rounded-xl px-4 py-3 min-w-[160px] border border-border/30"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${isHealthy ? "bg-status-healthy animate-pulse-soft" : "bg-status-degraded animate-pulse"}`} />
        <span className="text-xs font-mono font-medium text-foreground/90 truncate">{card.name}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-muted-foreground font-mono">{card.latency}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{card.uptime}</span>
      </div>
    </motion.div>
  );
}

/* ── Animated title with character reveal ── */
function AnimatedTitle() {
  const devLetters = "Dev".split("");
  const pulseLetters = "Pulse".split("");

  return (
    <div className="flex items-center justify-center gap-1 select-none">
      <span className="flex">
        {devLetters.map((char, i) => (
          <motion.span
            key={`dev-${i}`}
            initial={{ opacity: 0, y: 40, rotateX: -90 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{
              delay: 0.2 + i * 0.1,
              duration: 0.7,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight font-serif text-foreground inline-block"
            style={{ transformOrigin: "bottom" }}
          >
            {char}
          </motion.span>
        ))}
      </span>
      <span className="flex">
        {pulseLetters.map((char, i) => (
          <motion.span
            key={`pulse-${i}`}
            initial={{ opacity: 0, y: 40, rotateX: -90 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{
              delay: 0.5 + i * 0.1,
              duration: 0.7,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight font-serif text-primary text-glow-primary inline-block"
            style={{ transformOrigin: "bottom" }}
          >
            {char}
          </motion.span>
        ))}
      </span>
    </div>
  );
}

/* ── Orbiting dot ── */
function OrbitDot({ delay, radius, duration, color }: { delay: number; radius: number; duration: number; color: string }) {
  return (
    <motion.div
      className="absolute w-2 h-2 rounded-full"
      style={{ background: color, boxShadow: `0 0 12px ${color}` }}
      animate={{
        x: [radius, 0, -radius, 0, radius],
        y: [0, radius * 0.6, 0, -radius * 0.6, 0],
      }}
      transition={{ duration, delay, repeat: Infinity, ease: "linear" }}
    />
  );
}

export default function HeroAnimation3D() {
  const [showCards, setShowCards] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowCards(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full relative py-4">
      {/* Orbiting dots around the title area */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <OrbitDot delay={0} radius={220} duration={12} color="hsl(192 70% 55%)" />
          <OrbitDot delay={3} radius={180} duration={10} color="hsl(162 70% 44%)" />
          <OrbitDot delay={6} radius={260} duration={15} color="hsl(38 60% 55%)" />
        </div>
      </div>

      {/* Title */}
      <div className="mb-4">
        <AnimatedTitle />
      </div>

      {/* Heartbeat line */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.8 }}
        className="max-w-4xl mx-auto mb-6 px-4"
      >
        <HeartbeatLine />
      </motion.div>

      {/* Status cards */}
      <AnimatePresence>
        {showCards && (
          <div className="flex flex-wrap justify-center gap-3 px-4">
            {statusCards.map((card, i) => (
              <StatusCard key={card.name} card={card} index={i} />
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
