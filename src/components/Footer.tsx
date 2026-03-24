import { Zap } from "lucide-react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-border/30 py-12 px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-serif font-bold text-foreground">
            Dev<span className="text-primary">Pulse</span>
          </span>
          <span className="text-xs text-muted-foreground ml-2">Real-time API intelligence and agent safety</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-center md:justify-end">
          <a href="#pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          <a href="/agentguard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">AgentGuard</a>
          <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
          <Link to="/refund" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Refund</Link>
          <Link to="/contact" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
