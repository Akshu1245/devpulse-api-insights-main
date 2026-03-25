import { motion } from "framer-motion";
import { CheckCircle2, Zap, Shield, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { PLATFORM_PLANS } from "@/data/pricing";

export default function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-20">
      <div className="max-w-7xl mx-auto px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 mb-4">
            <Zap className="w-3 h-3" /> One platform, one price
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold font-serif text-foreground mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            API insights + AI agent security in one place. Start free, upgrade when you scale.
            <span className="block mt-2 text-sm text-primary font-medium">
              Up to 50% less than alternatives
            </span>
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {PLATFORM_PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`relative rounded-2xl p-6 lg:p-8 border transition-all duration-300 ${
                plan.highlighted
                  ? "border-primary/50 ring-2 ring-primary/20 glass-card shadow-[0_0_40px_-12px_hsl(var(--primary)/0.3)] scale-[1.02]"
                  : "border-border glass-card hover:border-primary/30"
              }`}
            >
              {plan.badge && (
                <span
                  className={`absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold ${
                    plan.highlighted
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}
                >
                  {plan.badge}
                </span>
              )}

              <div className="flex items-center gap-2 mb-6">
                {plan.id === "free" ? (
                  <Activity className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Shield className="w-5 h-5 text-primary" />
                )}
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
              </div>

              <div className="mb-2">
                <span className="text-4xl lg:text-5xl font-bold font-mono text-primary">
                  {plan.price}
                </span>
                <span className="text-muted-foreground">{plan.period}</span>
                {"priceInr" in plan && plan.priceInr && (
                  <div className="text-xs text-muted-foreground mt-1">{plan.priceInr}{plan.period}</div>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                {plan.apis} APIs
                {plan.agents > 0 ? ` · ${plan.agents} agent${plan.agents !== 1 ? "s" : ""}` : " · No AgentGuard"}
                {plan.tasksPerMonth != null && plan.tasksPerMonth > 0 ? ` · ${plan.tasksPerMonth} tasks/mo` : plan.tasksPerMonth === null ? " · Unlimited tasks" : ""}
              </p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to="/auth"
                className={`block w-full py-3 rounded-xl text-center text-sm font-semibold transition-all ${
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20"
                    : "border border-border text-foreground hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-xs text-muted-foreground mt-8"
        >
          All plans include API Health Monitor, Compatibility Graph, Code Generator & Doc Search. No hidden fees.
        </motion.p>
      </div>
    </section>
  );
}
