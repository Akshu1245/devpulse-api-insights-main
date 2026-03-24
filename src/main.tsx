import { createRoot } from "react-dom/client";
import "./index.css";

const rootEl = document.getElementById("root");

function renderFatal(message: string) {
	if (!rootEl) return;
	rootEl.innerHTML = `
		<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#e2e8f0;padding:24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
			<div style="max-width:720px;width:100%;background:#111827;border:1px solid #334155;border-radius:12px;padding:20px;box-shadow:0 12px 30px rgba(0,0,0,.35);">
				<h1 style="font-size:20px;margin:0 0 8px 0;">App failed to start</h1>
				<p style="margin:0 0 8px 0;color:#94a3b8;">A runtime error occurred during initialization.</p>
				<pre style="white-space:pre-wrap;word-break:break-word;background:#020617;border:1px solid #1e293b;border-radius:8px;padding:12px;color:#fca5a5;">${message}</pre>
			</div>
		</div>
	`;
}

if (!rootEl) {
	throw new Error("Root element #root was not found.");
}

window.addEventListener("error", (event) => {
	if (event?.error) {
		console.error("[Bootstrap Error]", event.error);
	}
});

window.addEventListener("unhandledrejection", (event) => {
	console.error("[Unhandled Rejection]", event.reason);
});

import("./App.tsx")
	.then(({ default: App }) => {
		createRoot(rootEl).render(<App />);
	})
	.catch((error: unknown) => {
		const message = error instanceof Error ? `${error.message}\n\n${error.stack || ""}` : String(error);
		console.error("[Startup Failure]", error);
		renderFatal(message);
	});
