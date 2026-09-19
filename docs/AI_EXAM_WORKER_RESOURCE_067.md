# AI-EXAM-067A — Edge worker resource-limit recovery

Production `Dia_12_Test_11` returned `WORKER_RESOURCE_LIMIT`. Its generation telemetry remained `RUNNING` / `STARTED`, confirming the worker ended before terminal telemetry was written.

The production-safe correction changes the orchestration boundary without changing assessment authority, Knowledge Pack construction, canonical validation, or teacher approval:

- `exam-ai-router` performs only the short provider/model visibility and ranking step and returns opaque route IDs.
- The browser still exposes no provider/model/tuning controls, but calls `exam-ai-orchestrator` directly for each generation attempt. The long provider request therefore consumes one Edge worker instead of a nested router plus orchestrator worker.
- Validation failures may receive one repair retry. `WORKER_RESOURCE_LIMIT` and other infrastructure/provider failures skip repair and move to another candidate.
- The deployed canonical `exam-ai-orchestrator` remains the execution boundary and still sends every AI result through `exam-ai-bridge` before a request can become `READY_FOR_REVIEW`.
- Provider selection is tuned separately so the normal route prefers a medium-effort model suitable for full exam generation; the previous high-effort model remains available as fallback.

No alternate room-write path is introduced. Final publication still requires explicit teacher approval and the existing canonical room-save RPC.