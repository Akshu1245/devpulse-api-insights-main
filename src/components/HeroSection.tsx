import { memo, useMemo, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { Activity, Zap, GitBranch, Code2, Search, Shield } from "lucide-react";
import { useHealthStore } from "@/hooks/useHealthStore";

const HeroAnimation3D = lazy(() => import("@/components/HeroAnimation3D"));

const features = [
  { icon: Activity, label: "Health Monitor" },
  { icon: GitBranch, label: "Compatibility" },
  { icon: Code2, label: "Code Gen" },
  { icon: Search, label: "Doc Search" },
  { icon: Shield, label: "Rate Limits" },
  { icon: Zap, label: "Real time" },
];

const AmbientOrb = memo(({ delay, className }: { delay: number; className: string }) => (
  <motion.div
    className={`absolute rounded-full ${className}`}
    animate={{
      scale: [1, 1.2, 1],
      opacity: [0.12, 0.25, 0.12],
    }}
    transition={{ duration: 8, delay, repeat: Infinity, ease: "easeInOut" }}
    style={{ filter: "blur(80px)", willChange: "transform, opacity" }}
  />
));

const FeaturePill = memo(({ icon: Icon, label, index }: { icon: any; label: string; index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.6 + index * 0.08, ease: [0.16, 1, 0.3, 1] }}
    className="card-3d"
  >
    <div className="card-3d-inner glass-card-hover gradient-border px-4 py-2.5 rounded-xl flex items-center gap-2.5 cursor-default">
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-sm font-medium text-foreground/90">{label}</span>
    </div>
  </motion.div>
));

export default function HeroSection() {
  const { metrics, isProbing } = useHealthStore();
  const { healthy, total } = useMemo(() => ({
    healthy: metrics.filter(m => m.status === "healthy").length,
    total: metrics.length,
  }), [metrics]);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Ambient lighting */}
      <div className="absolute inset-0 ambient-bg" />
      <AmbientOrb delay={0} className="w-[500px] h-[500px] bg-primary -top-32 left-1/4" />
      <AmbientOrb delay={2} className="w-[400px] h-[400px] bg-secondary top-1/2 -right-20" />
      <AmbientOrb delay={4} className="w-[350px] h-[350px] bg-accent bottom-0 left-0" />

      {/* Dot grid */}
      <div className="absolute inset-0 dot-grid opacity-60" />

      {/* Noise texture */}
      <div className="absolute inset-0 noise-overlay" />

      <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
        {/* Live status badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2.5 glass-card px-5 py-2.5 rounded-full mb-10"
        >
          <span className={`w-2 h-2 rounded-full ${isProbing ? "bg-status-degraded animate-pulse" : "bg-status-healthy animate-pulse-soft"}`} />
          <span className="text-sm text-muted-foreground font-mono tracking-wide">
            {total > 0
              ? <>{isProbing ? "PROBING" : "MONITORING"} <span className="text-status-healthy font-medium">{healthy}</span><span className="text-muted-foreground/50">/</span><span className="text-foreground/70">{total}</span> APIs</>
              : "INITIALIZING PROBES..."
            }
          </span>
        </motion.div>

        {/* SEO h1 - visually hidden */}
        <h1 className="sr-only">DevPulse Real time API Health Monitor</h1>

        {/* 3D Title Animation: "Dev" morphs into robot, walks to "Pulse", wraps band, shows ECG */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <Suspense fallback={
            <div className="h-[300px] md:h-[380px] flex items-center justify-center">
              <span className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight font-serif">
                <span className="text-foreground">Dev</span>
                <span className="text-primary text-glow-primary">Pulse</span>
              </span>
            </div>
          }>
            <HeroAnimation3D />
          </Suspense>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-14 leading-relaxed font-light"
        >
          Real time API intelligence that monitors health, discovers compatibility,
          generates integration code & provides AI powered docs — crafted for{" "}
          <span className="text-secondary font-medium">developers</span>.
        </motion.p>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="flex flex-wrap justify-center gap-3 mb-16"
        >
          {features.map((f, i) => (
            <FeaturePill key={f.label} icon={f.icon} label={f.label} index={i} />
          ))}
        </motion.div>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-wrap gap-4 justify-center"
        >
          <a
            href="#dashboard"
            className="group relative px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg 
                       shadow-[0_4px_16px_hsl(34_80%_56%/0.3),0_1px_2px_hsl(34_80%_56%/0.2)]
                       hover:shadow-[0_8px_32px_hsl(34_80%_56%/0.4),0_2px_4px_hsl(34_80%_56%/0.3)]
                       hover:-translate-y-0.5 transition-all duration-300"
          >
            Launch Dashboard
          </a>
          <a
            href="#compatibility"
            className="px-8 py-4 rounded-xl glass-card-hover gradient-border text-foreground font-semibold text-lg"
          >
            Explore APIs
          </a>
          <a
            href="#pricing"
            className="px-8 py-4 rounded-xl glass-card-hover gradient-border text-foreground font-semibold text-lg"
          >
            View Pricing
          </a>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="w-5 h-9 rounded-full border border-muted-foreground/20 flex justify-center pt-2">
            <div className="w-1 h-2.5 rounded-full bg-primary/60" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
