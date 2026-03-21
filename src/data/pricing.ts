/**
 * Unified DevPulse platform pricing.
 * Covers: API Health Monitor, Compatibility, Code Gen, Doc Search + AgentGuard.
 *
 * Free: Main project only (no AgentGuard). AgentGuard unlocks with Pro/Team.
 * Prices ($12 Pro, $39 Team) match Stripe products in useSubscription.ts.
 * INR shown alongside USD; Stripe charges in checkout currency.
 */
export const PLATFORM_PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceInr: "Rs 0",
    period: "/forever",
    apis: 5,
    agents: 0,
    tasksPerMonth: 0,
    retention: "7 days",
    highlighted: false,
    cta: "Get Started Free",
    features: [
      "5 API monitors",
      "Compatibility, Code Gen, Doc Search",
      "No AgentGuard (upgrade to unlock)",
      "7-day log retention",
      "Basic health alerts",
      "CSV export",
      "Community support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$12",
    priceInr: "Rs 999",
    period: "/month",
    apis: 25,
    agents: 10,
    tasksPerMonth: null, // unlimited
    retention: "90 days",
    highlighted: true,
    cta: "Start Pro Trial",
    badge: "Most Popular",
    features: [
      "25 API monitors",
      "10 AI agents",
      "Unlimited tasks",
      "90-day retention",
      "Cost analytics & forecasting",
      "Webhook integrations",
      "Full API access",
      "Code generator & Doc Search",
      "Email support",
    ],
  },
  {
    id: "team",
    name: "Team",
    price: "$39",
    priceInr: "Rs 3,249",
    period: "/month",
    apis: 100,
    agents: 50,
    tasksPerMonth: null,
    retention: "Unlimited",
    highlighted: false,
    cta: "Start Team Trial",
    badge: "Best Value",
    features: [
      "100 API monitors",
      "50 AI agents",
      "Team dashboard",
      "Unlimited retention",
      "Security monitoring",
      "SSO & custom webhooks",
      "Audit logs",
      "Priority support",
    ],
  },
] as const;
