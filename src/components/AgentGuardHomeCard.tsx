import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Crown, Users, CreditCard, ArrowRight, Loader2, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

const USD_TO_INR_APPROX = 83;

function usdToInr(usd: number) {
  // Keep INR close to USD to avoid "India vs US pricing" backlash.
  return Math.round(usd * USD_TO_INR_APPROX);
}

export default function AgentGuardHomeCard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const {
    tier,
    subscribed,
    loading: subLoading,
    checkout,
    manageSubscription,
  } = useSubscription();

  const goUsd = 12;
  const teamUsd = 39;
  const goInr = usdToInr(goUsd);
  const teamInr = usdToInr(teamUsd);

  const isBusy = authLoading || subLoading;

  const nextStartPro = "/agentguard/settings?start=pro";
  const nextStartTeam = "/agentguard/settings?start=team";

  const loginWithNext = (next: string) => {
    navigate(`/auth?next=${encodeURIComponent(next)}`);
  };

  const startPro = () => {
    if (!user) return loginWithNext(nextStartPro);
    checkout("pro");
  };

  const startTeam = () => {
    if (!user) return loginWithNext(nextStartTeam);
    checkout("team");
  };

  const contactBusiness = () => {
    window.open("mailto:sales@devpulse.ai?subject=AgentGuard%20Business%20Plan", "_blank");
  };

  const openAgentGuard = () => {
    navigate("/agentguard");
  };

  const priceNote = useMemo(() => {
    return "INR shown as approx. Final billing uses your checkout currency.";
  }, []);

  if (isBusy) {
    return (
      <section className="scroll-mt-20">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="glass-card rounded-2xl p-8 border border-border flex items-center gap-3 justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading AgentGuard access…</span>
          </div>
        </div>
      </section>
    );
  }

  const showAccessButton = subscribed && tier !== "free";

  return (
    <section id="agentguard" className="scroll-mt-20">
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="glass-card rounded-3xl border border-border p-6 md:p-10">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-3">
                <Shield className="w-6 h-6 text-primary" />
                <h2 className="text-2xl md:text-3xl font-bold font-serif text-foreground">AgentGuard</h2>
              </div>
              <p className="text-muted-foreground">
                Free users get DevPulse core access only. AgentGuard (security + cost monitoring for AI agents)
                unlocks with subscription.
              </p>

              <div className="mt-4 text-xs text-muted-foreground">
                {priceNote}
              </div>
            </div>

            {showAccessButton ? (
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <button
                  onClick={openAgentGuard}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Open Dashboard <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => manageSubscription()}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                >
                  Manage Billing <CreditCard className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <button
                  onClick={startPro}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Start Go Trial <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={startTeam}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                >
                  Start Business Trial <Users className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="divider-gradient my-6" />

          {!showAccessButton && (
            <div>
              <div className="text-sm text-muted-foreground mb-4">
                Trial requires a credit card. You can cancel anytime before the paid period starts.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Go */}
                <div className="glass-card rounded-2xl border border-border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-primary" />
                      <h3 className="text-lg font-semibold text-foreground">Go</h3>
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      Card required
                    </span>
                  </div>
                  <div className="mb-2">
                    <span className="text-3xl font-bold font-mono text-primary">${goUsd}/mo</span>
                    <div className="text-xs text-muted-foreground">Rs {goInr}/mo</div>
                  </div>
                  <ul className="space-y-2 text-xs text-muted-foreground mt-3">
                    <li>Up to 10 agents</li>
                    <li>Cost analytics + AI forecasting</li>
                    <li>Webhooks & alerts</li>
                  </ul>
                  <button
                    onClick={startPro}
                    className="mt-5 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Start Go Trial
                  </button>
                </div>

                {/* Pro */}
                <div className="glass-card rounded-2xl border border-primary/30 ring-1 ring-primary/20 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">Pro</h3>
                  </div>
                  <div className="mb-2">
                    <span className="text-3xl font-bold font-mono text-primary">${goUsd}/mo</span>
                    <div className="text-xs text-muted-foreground">Rs {goInr}/mo</div>
                  </div>
                  <ul className="space-y-2 text-xs text-muted-foreground mt-3">
                    <li>Up to 10 agents</li>
                    <li>API access + webhook integrations</li>
                    <li>Security monitoring</li>
                  </ul>
                  <button
                    onClick={startPro}
                    className="mt-5 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Start Pro
                  </button>
                </div>

                {/* Business */}
                <div className="glass-card rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">Business</h3>
                  </div>
                  <div className="mb-2">
                    <span className="text-3xl font-bold font-mono text-primary">${teamUsd}/mo</span>
                    <div className="text-xs text-muted-foreground">Rs {teamInr}/mo</div>
                  </div>
                  <ul className="space-y-2 text-xs text-muted-foreground mt-3">
                    <li>Up to 50 agents</li>
                    <li>SSO + audit logs</li>
                    <li>Team workspaces</li>
                  </ul>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-1 gap-3">
                    <button
                      onClick={contactBusiness}
                      className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all flex items-center justify-center gap-2"
                    >
                      <Mail className="w-4 h-4" /> Contact Sales
                    </button>
                    <button
                      onClick={startTeam}
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      Start Business Trial
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
