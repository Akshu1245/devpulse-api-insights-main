import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";

/* ── Radar ping rings ── */
function RadarRings({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{
            width: 80 + i * 70,
            height: 80 + i * 70,
            borderColor: `hsl(var(--primary) / ${active ? 0.25 : 0.06})`,
          }}
          animate={
            active
              ? { scale: [1, 1.15, 1], opacity: [0.15, 0.4, 0.15] }
              : { scale: 1, opacity: 0.08 }
          }
          transition={
            active
              ? { duration: 1.5, delay: i * 0.2, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.5 }
          }
        />
      ))}
    </div>
  );
}

/* ── Scanning sweep line ── */
function ScanSweep({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      animate={{ rotate: 360 }}
      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
    >
      <div
        className="absolute w-1/2 h-[2px] origin-left"
        style={{
          left: "50%",
          top: "50%",
          background: "linear-gradient(90deg, hsl(var(--primary) / 0.8), transparent)",
        }}
      />
    </motion.div>
  );
}

/* ── Floating discovered nodes ── */
const discoveredAPIs = [
  { name: "Stripe", angle: 30, dist: 140, delay: 0.3 },
  { name: "GitHub", angle: 95, dist: 170, delay: 0.6 },
  { name: "OpenAI", angle: 160, dist: 130, delay: 0.9 },
  { name: "AWS", angle: 230, dist: 155, delay: 1.2 },
  { name: "Twilio", angle: 310, dist: 145, delay: 1.5 },
];

function DiscoveredNode({ api, visible }: { api: typeof discoveredAPIs[0]; visible: boolean }) {
  const x = Math.cos((api.angle * Math.PI) / 180) * api.dist;
  const y = Math.sin((api.angle * Math.PI) / 180) * api.dist;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute flex items-center gap-1.5 glass-card px-3 py-1.5 rounded-full"
          style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: "translate(-50%, -50%)" }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ delay: api.delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-status-healthy animate-pulse-soft" />
          <span className="text-[10px] font-mono text-foreground/80">{api.name}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Power button ── */
function PowerButton({
  phase,
  holdProgress,
  onPointerDown,
  onPointerUp,
}: {
  phase: "idle" | "holding" | "scanning" | "done";
  holdProgress: number;
  onPointerDown: () => void;
  onPointerUp: () => void;
}) {
  const circumference = 2 * Math.PI * 52;
  const strokeDashoffset = circumference - (holdProgress / 100) * circumference;

  return (
    <motion.div
      className="relative cursor-pointer select-none"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      whileTap={{ scale: 0.95 }}
      animate={
        phase === "scanning"
          ? { scale: [1, 1.05, 1] }
          : phase === "done"
          ? { scale: [1, 1.5], opacity: [1, 0] }
          : {}
      }
      transition={
        phase === "scanning"
          ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
          : phase === "done"
          ? { duration: 0.8, ease: "easeIn" }
          : {}
      }
    >
      {/* Progress ring */}
      <svg width="120" height="120" viewBox="0 0 120 120" className="absolute -inset-[10px]">
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke="hsl(var(--muted) / 0.3)"
          strokeWidth="3"
        />
        <motion.circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transform: "rotate(-90deg)", transformOrigin: "center", filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.5))" }}
        />
      </svg>

      {/* Button body */}
      <div
        className="w-[100px] h-[100px] rounded-full flex items-center justify-center relative"
        style={{
          background: `radial-gradient(circle at 40% 35%, hsl(var(--card)), hsl(var(--background)))`,
          boxShadow:
            phase === "holding" || phase === "scanning"
              ? `0 0 30px hsl(var(--primary) / 0.3), 0 0 60px hsl(var(--primary) / 0.15), inset 0 2px 4px hsl(var(--surface-glass-highlight))`
              : `0 8px 32px hsl(225 14% 3% / 0.5), inset 0 2px 4px hsl(var(--surface-glass-highlight))`,
          border: "1px solid hsl(var(--surface-glass-border))",
          transition: "box-shadow 0.3s ease",
        }}
      >
        {/* Power icon */}
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <motion.path
            d="M12 2v6"
            stroke={phase === "idle" ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))"}
            strokeWidth="2.5"
            strokeLinecap="round"
            animate={
              phase !== "idle"
                ? { stroke: ["hsl(var(--primary))", "hsl(var(--status-healthy))", "hsl(var(--primary))"] }
                : {}
            }
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.path
            d="M16.24 7.76a6 6 0 1 1-8.49 0"
            stroke={phase === "idle" ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))"}
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            animate={
              phase !== "idle"
                ? { stroke: ["hsl(var(--primary))", "hsl(var(--status-healthy))", "hsl(var(--primary))"] }
                : {}
            }
            transition={{ duration: 2, repeat: Infinity }}
          />
        </svg>
      </div>
    </motion.div>
  );
}

/* ── Boot log terminal ── */
const bootMessages = [
  { text: "> Initializing DevPulse core...", delay: 0 },
  { text: "> Loading probe modules...", delay: 0.5 },
  { text: "> Scanning API endpoints...", delay: 1.0 },
  { text: "> Stripe .......... ONLINE", delay: 1.6, status: "ok" },
  { text: "> GitHub .......... ONLINE", delay: 2.0, status: "ok" },
  { text: "> OpenAI .......... DEGRADED", delay: 2.5, status: "warn" },
  { text: "> AWS S3 .......... ONLINE", delay: 3.0, status: "ok" },
  { text: "> Twilio .......... ONLINE", delay: 3.5, status: "ok" },
  { text: "> All systems operational", delay: 4.1, status: "ok" },
  { text: "> Launching dashboard...", delay: 4.7 },
];

function BootLog({ active }: { active: boolean }) {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (!active) { setVisibleLines(0); return; }
    const timers = bootMessages.map((msg, i) =>
      setTimeout(() => setVisibleLines(i + 1), msg.delay * 1000)
    );
    return () => timers.forEach(clearTimeout);
  }, [active]);

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-80 md:w-96 glass-card rounded-xl p-4 font-mono text-xs overflow-hidden"
      style={{ maxHeight: 240 }}
    >
      {bootMessages.slice(0, visibleLines).map((msg, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-1 flex items-center gap-2"
        >
          <span
            className={
              msg.status === "ok"
                ? "text-status-healthy"
                : msg.status === "warn"
                ? "text-status-degraded"
                : "text-muted-foreground"
            }
          >
            {msg.text}
          </span>
        </motion.div>
      ))}
      {visibleLines > 0 && visibleLines < bootMessages.length && (
        <motion.span
          className="inline-block w-2 h-3.5 bg-primary ml-1"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

/* ── Main Splash ── */
export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"idle" | "holding" | "scanning" | "done">("idle");
  const [holdProgress, setHoldProgress] = useState(0);
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showNodes, setShowNodes] = useState(false);
  const [showBoot, setShowBoot] = useState(false);

  const startHold = useCallback(() => {
    if (phase !== "idle") return;
    setPhase("holding");
    let p = 0;
    holdInterval.current = setInterval(() => {
      p += 2.0;
      if (p >= 100) {
        p = 100;
        if (holdInterval.current) clearInterval(holdInterval.current);
        setHoldProgress(100);
        // Transition to scanning
        setPhase("scanning");
        setShowNodes(true);
        setTimeout(() => {
          setShowBoot(true);
        }, 800);
        setTimeout(() => {
          setPhase("done");
          setTimeout(onComplete, 700);
        }, 5200);
        return;
      }
      setHoldProgress(p);
    }, 40);
  }, [phase, onComplete]);

  const stopHold = useCallback(() => {
    if (phase !== "holding") return;
    if (holdInterval.current) clearInterval(holdInterval.current);
    setPhase("idle");
    setHoldProgress(0);
  }, [phase]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      startHold();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [startHold]);

  useEffect(() => {
    return () => {
      if (holdInterval.current) clearInterval(holdInterval.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {phase !== "done" ? (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden"
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Background ambience */}
          <div className="absolute inset-0 ambient-bg" />
          <div className="absolute inset-0 dot-grid opacity-30" />
          <div className="absolute inset-0 noise-overlay" />

          {/* Radar rings */}
          <RadarRings active={phase === "scanning"} />
          <ScanSweep active={phase === "scanning"} />

          {/* Discovered API nodes */}
          {discoveredAPIs.map((api) => (
            <DiscoveredNode key={api.name} api={api} visible={showNodes} />
          ))}

          {/* Center content */}
          <div className="relative z-10 flex flex-col items-center gap-8">
            {/* Brand hint */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="flex items-center gap-2 mb-4"
            >
              <span className="text-2xl font-serif font-bold text-foreground">Dev</span>
              <span className="text-2xl font-serif font-bold text-primary text-glow-primary">Pulse</span>
            </motion.div>

            {/* Power button */}
            <PowerButton
              phase={phase}
              holdProgress={holdProgress}
              onPointerDown={startHold}
              onPointerUp={stopHold}
            />

            {/* Instruction text */}
            {phase === "idle" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-center mt-4"
              >
                <motion.p
                  className="text-sm font-mono text-muted-foreground tracking-widest uppercase"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                >
                  INITIALIZING BOOT SEQUENCE
                </motion.p>
                <p className="text-xs text-muted-foreground/40 font-mono mt-2">
                  loading monitoring systems
                </p>
              </motion.div>
            )}

            {phase === "holding" && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm font-mono text-primary tracking-widest uppercase"
              >
                CHARGING... {Math.round(holdProgress)}%
              </motion.p>
            )}

            {/* Boot log */}
            <BootLog active={showBoot} />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
