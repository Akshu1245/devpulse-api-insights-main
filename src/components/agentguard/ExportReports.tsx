import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  userId: string;
}

export default function ExportReports({ userId }: Props) {
  const [exporting, setExporting] = useState<string | null>(null);
  const { toast } = useToast();

  const exportCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAgents = async () => {
    setExporting("agents");
    const { data } = await supabase.from("agents").select("*").eq("user_id", userId);
    if (data) {
      exportCSV("agents", ["Name", "Status", "Framework", "Total Cost", "API Calls", "Tasks", "Created"],
        data.map(a => [a.name, a.status, a.framework || "", String(a.total_cost), String(a.total_api_calls), String(a.total_tasks), a.created_at])
      );
      toast({ title: "Exported agents report" });
    }
    setExporting(null);
  };

  const handleExportCosts = async () => {
    setExporting("costs");
    const { data } = await supabase.from("cost_entries").select("*").eq("user_id", userId).order("date", { ascending: false });
    if (data) {
      exportCSV("cost_report", ["Date", "Provider", "Model", "Cost", "API Calls", "Input Tokens", "Output Tokens"],
        data.map(c => [c.date, c.provider, c.model || "", String(c.cost), String(c.api_calls), String(c.input_tokens || 0), String(c.output_tokens || 0)])
      );
      toast({ title: "Exported cost report" });
    }
    setExporting(null);
  };

  const handleExportAlerts = async () => {
    setExporting("alerts");
    const { data } = await supabase.from("alerts").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (data) {
      exportCSV("alerts_report", ["Date", "Type", "Severity", "Title", "Message", "Read"],
        data.map(a => [a.created_at, a.alert_type, a.severity, a.title, a.message, String(a.is_read)])
      );
      toast({ title: "Exported alerts report" });
    }
    setExporting(null);
  };

  const reports = [
    { id: "agents", label: "Agent Summary", desc: "All agents with status, cost, and task stats", action: handleExportAgents },
    { id: "costs", label: "Cost Report", desc: "Detailed cost entries by provider and model", action: handleExportCosts },
    { id: "alerts", label: "Security Alerts", desc: "All alerts with type, severity, and status", action: handleExportAlerts },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold font-serif text-foreground">Export Reports</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reports.map(r => (
          <div key={r.id} className="glass-card rounded-xl p-5 border border-border">
            <FileText className="w-8 h-8 text-primary mb-3" />
            <h4 className="font-semibold text-foreground mb-1">{r.label}</h4>
            <p className="text-xs text-muted-foreground mb-4">{r.desc}</p>
            <button
              onClick={r.action}
              disabled={exporting === r.id}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
            >
              {exporting === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
