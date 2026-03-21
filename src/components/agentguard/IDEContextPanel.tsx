import { useMemo } from "react";
import { Copy, FileCode2, Sparkles, TerminalSquare } from "lucide-react";
import { useDevPulseIDE } from "@/context/DevPulseIDEContext";
import { useToast } from "@/hooks/use-toast";

export default function IDEContextPanel({
  onAnalyzeSelection
}: {
  onAnalyzeSelection?: () => void;
}) {
  const { editorContext, isEmbeddedInIDE, workspaceName, lastActionType, lastUpdatedAt } = useDevPulseIDE();
  const { toast } = useToast();

  const selectionInfo = useMemo(() => {
    if (!editorContext?.selectedText) return "No code selected";
    const chars = editorContext.selectedText.length;
    const lines = editorContext.selectedText.split("\n").length;
    return `${lines} lines, ${chars} chars`;
  }, [editorContext?.selectedText]);

  if (!isEmbeddedInIDE && !editorContext) {
    return null;
  }

  const onCopy = async () => {
    if (!editorContext?.selectedText) {
      toast({ title: "Nothing to copy", description: "Select code in your IDE first." });
      return;
    }
    await navigator.clipboard.writeText(editorContext.selectedText);
    toast({ title: "Selection copied", description: "Code copied from IDE context." });
  };

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5 border border-border mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <TerminalSquare className="w-4 h-4 text-primary" />
          <h3 className="text-sm sm:text-base font-semibold text-foreground">IDE Context</h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/15 text-primary">
            {isEmbeddedInIDE ? "Connected" : "Cached"}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {workspaceName ? `Workspace: ${workspaceName}` : "Workspace context available"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground mb-1">File</p>
          <p className="font-mono text-xs break-all text-foreground">{editorContext?.relativePath || "No active file yet"}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground mb-1">Language</p>
          <p className="text-foreground">{editorContext?.languageId || "Unknown"}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground mb-1">Selection</p>
          <p className="text-foreground">{selectionInfo}</p>
        </div>
      </div>

      {editorContext?.selectedText && (
        <div className="mt-3 rounded-lg border border-border p-3 bg-muted/20">
          <p className="text-xs text-muted-foreground mb-2">Selected snippet preview</p>
          <pre className="text-xs overflow-auto max-h-36 text-foreground whitespace-pre-wrap">
{editorContext.selectedText.slice(0, 1500)}
          </pre>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onAnalyzeSelection}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs sm:text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Sparkles className="w-4 h-4" />
          Analyze With DevPulse
        </button>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Copy className="w-4 h-4" />
          Copy Selection
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("devpulse:focus-ide-tools"))}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <FileCode2 className="w-4 h-4" />
          Use IDE Workflow
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">
        {lastActionType ? `Last action: ${lastActionType}` : "Waiting for IDE actions"}
        {lastUpdatedAt ? ` - ${new Date(lastUpdatedAt).toLocaleTimeString()}` : ""}
      </p>
    </div>
  );
}
