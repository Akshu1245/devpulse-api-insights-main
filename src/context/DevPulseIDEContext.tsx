import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type IDEActionType = "devpulse:editorContext" | "devpulse:analyzeSelection";

export interface IDEContextPayload {
  filePath?: string;
  languageId?: string;
  relativePath?: string;
  workspaceFolder?: string;
  selectedText?: string;
  selectionStartLine?: number;
  selectionEndLine?: number;
  cursorLine?: number;
}

interface IDEState {
  isEmbeddedInIDE: boolean;
  workspaceName?: string;
  colorThemeKind?: number;
  editorContext?: IDEContextPayload;
  lastActionType?: IDEActionType;
  lastUpdatedAt?: string;
}

const STORAGE_KEY = "devpulse_ide_bridge_state_v1";

const DevPulseIDEContext = createContext<IDEState>({ isEmbeddedInIDE: false });

function readStoredState(): IDEState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { isEmbeddedInIDE: false };
    }
    const parsed = JSON.parse(raw) as IDEState;
    return parsed && typeof parsed === "object" ? parsed : { isEmbeddedInIDE: false };
  } catch {
    return { isEmbeddedInIDE: false };
  }
}

function saveState(state: IDEState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function DevPulseIDEProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<IDEState>(() => ({
    ...readStoredState(),
    isEmbeddedInIDE: window.self !== window.top
  }));

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; payload?: unknown } | undefined;
      if (!message?.type || !message.type.startsWith("devpulse:")) {
        return;
      }

      setState((prev) => {
        let next = { ...prev, isEmbeddedInIDE: true };

        if (message.type === "devpulse:hostReady" && message.payload && typeof message.payload === "object") {
          const payload = message.payload as { workspaceName?: string };
          next = { ...next, workspaceName: payload.workspaceName };
        }

        if (
          (message.type === "devpulse:editorContext" || message.type === "devpulse:analyzeSelection") &&
          message.payload &&
          typeof message.payload === "object"
        ) {
          next = {
            ...next,
            editorContext: message.payload as IDEContextPayload,
            lastActionType: message.type,
            lastUpdatedAt: new Date().toISOString()
          };
        }

        if (message.type === "devpulse:theme" && message.payload && typeof message.payload === "object") {
          const payload = message.payload as { kind?: number };
          next = { ...next, colorThemeKind: payload.kind };
        }

        saveState(next);
        window.dispatchEvent(new CustomEvent("devpulse:ide-state-updated", { detail: next }));
        return next;
      });
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const value = useMemo(() => state, [state]);
  return <DevPulseIDEContext.Provider value={value}>{children}</DevPulseIDEContext.Provider>;
}

export function useDevPulseIDE() {
  return useContext(DevPulseIDEContext);
}
