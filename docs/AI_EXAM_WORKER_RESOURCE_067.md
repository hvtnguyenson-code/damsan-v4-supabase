# AI-EXAM-067 — Edge worker resource-limit hardening

Observed production failure: an automatic API generation request remained `RUNNING` / `STARTED` after the browser received `WORKER_RESOURCE_LIMIT`. The previous one-click router synchronously waited on `exam-ai-orchestrator`, so one long provider generation consumed the wall-clock budget of two nested Edge workers. The orchestrator also read an upstream response with `res.text()` before applying its size cap, allowing a very large provider payload to allocate memory before truncation.

067 changes the orchestration boundary without changing exam authority, Knowledge Pack construction, canonical validation, or teacher approval:

- `exam-ai-router` returns a short-lived route plan only for the normal UI path; it no longer owns the long provider request.
- The browser keeps provider/model selection invisible but executes one candidate attempt at a time directly against `exam-ai-orchestrator`.
- Validation failures may receive one repair retry; infrastructure/resource/provider failures skip repair and move to the next route candidate.
- `exam-ai-orchestrator` exposes a heartbeat JSON-stream action so the HTTP connection is not idle while a long provider call is in progress.
- Provider response bodies are read incrementally with a hard byte cap before JSON parsing; the function never calls unbounded `res.text()` on provider output.
- Stale `RUNNING` generation telemetry is reconciled before a new attempt for the same request.

The canonical server boundary is unchanged: provider output must parse as `DAMSAN_EXAM_V1`, then pass `exam-ai-bridge` and all existing validation/quality gates before the request can become `READY_FOR_REVIEW`.
