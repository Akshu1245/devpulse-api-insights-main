# Changelog

## [Unreleased]

### Added

- **Live compatibility scores** – Compatibility graph now uses real API health. Scores adjust when APIs are healthy, degraded, or down.
- **Real agent execution traces** – Agent Flow view shows actual execution steps from `agent_logs` instead of demo data.
- **24h uptime persistence** – Uptime history is stored in localStorage and survives page refresh.
- **Incident timeline** – When APIs go down, they appear in a 24h incident timeline.
- **Latency benchmark** – APIs are flagged as “fast” (under 60% of median) or “slow” (over 150% of median).
- **Rate limit watch** – APIs that report rate limits are listed, with a warning when remaining calls are low.
- **Cost anomaly detection** – AgentGuard alerts when today’s spend is more than 2× the 7-day average.
- **API status badge** – Embeddable badge for README/docs with dark and light variants.
- **Keyboard shortcuts** – Press `Escape` to close modals (Status Badge, API Key Manager, Registry Manager).

### Changed

- Compatibility graph displays live scores driven by current health.
- Agent Flow view fetches real traces from Supabase when agents have run.
- Cost Forecast filters by `user_id` for correct per-user data.
- Trend charts iterate over active APIs instead of all built-in APIs.
