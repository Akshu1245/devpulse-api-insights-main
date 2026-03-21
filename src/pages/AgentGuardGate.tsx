import { useSubscription } from "@/hooks/useSubscription";
import AgentGuardDashboard from "./AgentGuardDashboard";
import AgentGuardLanding from "./AgentGuardLanding";

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

/**
 * Gate for /agentguard: shows Landing when unauthenticated,
 * Dashboard when authenticated. Aligns with "Security & Cost Control for AI Agents" vision.
 */
export default function AgentGuardGate() {
  const { tier, subscribed, loading } = useSubscription();
  if (loading) return <PageLoader />;

  // Free DevPulse users can browse the main project, but AgentGuard access requires subscription.
  return subscribed && tier !== "free" ? <AgentGuardDashboard /> : <AgentGuardLanding />;
}
