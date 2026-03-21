import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Bot, DollarSign, AlertTriangle, Zap, ArrowRight, X, Sparkles } from "lucide-react";

interface Props {
  onComplete: () => void;
}

const steps = [
  {
    icon: Shield,
    title: "Welcome to AgentGuard",
    desc: "Monitor, limit, and secure your AI agents in real time. Let's take a quick tour.",
    color: "text-primary",
  },
  {
    icon: Bot,
    title: "Add Your Agents",
    desc: "Register your AI agents (LangChain, CrewAI, OpenAI, etc.) and track their activity in one dashboard.",
    color: "text-status-healthy",
  },
  {
    icon: DollarSign,
    title: "Track Costs",
    desc: "See spending per agent, per provider, per model. Set cost limits to prevent surprise bills.",
    color: "text-primary",
  },
  {
    icon: AlertTriangle,
    title: "Security Alerts",
    desc: "Get notified about infinite loops, API key leaks, and cost overruns. We auto-pause dangerous agents.",
    color: "text-status-down",
  },
  {
    icon: Sparkles,
    title: "You're All Set!",
    desc: "Start by adding your first agent. The SDK integration guide is available in the docs tab.",
    color: "text-secondary",
  },
];

export default function OnboardingTour({ onComplete }: Props) {
  const [step, setStep] = useState(0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="glass-card rounded-2xl p-8 border border-border max-w-md w-full text-center relative"
        >
          <button onClick={onComplete} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>

          {(() => {
            const Icon = steps[step].icon;
            return (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/30 mb-4">
                  <Icon className={`w-8 h-8 ${steps[step].color}`} />
                </div>
                <h2 className="text-xl font-bold font-serif text-foreground mb-2">{steps[step].title}</h2>
                <p className="text-muted-foreground text-sm mb-6">{steps[step].desc}</p>
              </>
            );
          })()}

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-6">
            {steps.map((_, i) => (
              <span key={i} className={`w-2 h-2 rounded-full transition-all ${i === step ? "bg-primary w-6" : "bg-muted-foreground/30"}`} />
            ))}
          </div>

          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="flex-1 py-2.5 rounded-xl glass-card text-sm text-muted-foreground hover:text-foreground transition-colors">
                Back
              </button>
            )}
            <button
              onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : onComplete()}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              {step < steps.length - 1 ? (
                <>Next <ArrowRight className="w-4 h-4" /></>
              ) : (
                "Get Started"
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
