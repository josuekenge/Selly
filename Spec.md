V1 SPEC-DRIVEN IMPLEMENTATION PLAN

Sales Copilot Desktop App (Cluely-style, Sales-focused)

1. V1 PRODUCT SCOPE (NON-NEGOTIABLE)
What V1 MUST do

Run as a Windows desktop app.

Detect when a sales call is happening.

Capture microphone + system audio locally.

Perform cloud transcription in near real time.

Automatically detect questions asked by the prospect.

Generate visual sales suggestions within ~2–3 seconds.

Save:

Audio

Transcript

Suggestions

Generate post-call summary and coaching.

Support private, salesperson-scoped knowledge ingestion.

Enforce workspace isolation.

What V1 MUST NOT do

Join meetings as a bot.

Speak or inject messages into calls.

Require salesperson interaction during calls.

Support mobile.

Support video.

Perform fine-tuning.

Support cross-workspace data access.

Anything outside this list is V2.

2. CORE SYSTEM COMPONENTS

V1 consists of three systems. They must remain separate.

A. Desktop Shell (Tauri)

Responsibilities:

App lifecycle.

Permissions.

UI rendering.

IPC bridge.

Must NOT:

Capture audio.

Call LLMs.

Process transcripts.

B. Local Agent (System Companion)

Responsibilities:

Audio capture.

Device management.

Streaming audio.

Question detection.

Transcription session lifecycle.

This is the most sensitive component.

C. Backend API (Modular Monolith)

Responsibilities:

Auth and workspace isolation.

Knowledge ingestion and retrieval.

LLM calls.

Audit logging.

Post-call analysis.

3. EVENT-DRIVEN FLOW (V1)
Live Call Flow

Audio capture starts.

Audio streamed to transcription provider.

Partial transcripts emitted.

Question detected locally.

Retrieval runs.

LLM generates suggestion.

Suggestion displayed silently.

No user input required.

Post-Call Flow

Recording stops.

Final transcript saved.

Summary and coaching generated asynchronously.

Results shown in dashboard.

4. SPECIFIED LATENCY TARGETS

These are guidelines, not guarantees.

Audio capture: real time.

Partial transcription: ≤ 1 second.

Question detection: < 100 ms.

Retrieval + LLM: ≤ 2–3 seconds perceived.

Post-call analysis: async, no SLA.

5. SECURITY AND DATA RULES (V1)

Audio and transcripts are private by default.

Data belongs to a workspace.

Salesperson can share explicitly.

All AI outputs are logged.

No cross-workspace retrieval.

6. REQUIRED MODULES (AUTHORITATIVE)
Local Agent Modules

You MUST implement these as isolated modules.

AudioDeviceManager

AudioCapture

AudioSessionController

TranscriptionClient (cloud only in V1)

QuestionDetector

IntentNormalizer

EventEmitter

Backend Modules

Auth and Workspace

Knowledge Ingestion

Retrieval Engine

LLM Gateway

Call Analysis

Audit Logger

7. SHARED PACKAGES (AUTHORITATIVE)

/packages
  /contracts        # ONLY shared interfaces and event schemas

CONTRACTS RULES (STRICTLY ENFORCED):
- No logic.
- No helpers.
- No data access.
- Only DTOs, event schemas, request/response shapes.
- If something needs logic, it lives in a module, not here.

8. V1 TECHNOLOGY STACK (EXPLICIT)

The following technology choices are authoritative for V1 implementation.

Frontend (Desktop UI)

The V1 frontend is implemented using React and TypeScript. It runs inside a Tauri webview and is responsible only for UI rendering and state management. It must not perform audio capture, transcription, or LLM calls directly.

Desktop Shell

The desktop shell is implemented using Tauri (Rust-based). It is responsible only for windowing, OS-level permissions, application lifecycle, IPC bridging between the UI and local agent, and packaging for distribution. It must not contain business logic.

Local Agent

The local agent is implemented using Node.js and TypeScript. It runs as a local background process on the user's machine. It is responsible for audio capture, device management, transcription streaming to cloud providers, and local question detection. This is the most sensitive component.

Backend API

The backend is implemented using Node.js and Express as a modular monolith. There is one deployable backend service. No microservices. All backend modules run in the same process and communicate through defined service interfaces.

AI and Transcription

V1 uses external LLM APIs for suggestion generation and post-call analysis. V1 uses cloud transcription only. All external AI and transcription services must be wrapped in adapters to allow future provider swaps.

9. FILE STRUCTURE (AUTHORITATIVE)

This is what you tell Gemini to generate and respect.

Desktop App (Tauri)
/apps/desktop
  /src
    /ui
      /screens
        Home.tsx
        LiveCall.tsx
        PostCall.tsx
        Knowledge.tsx
      /components
      /state
    /ipc
      events.ts
      handlers.ts
    main.ts

Local Agent
/apps/agent
  /src
    /audio
      AudioDeviceManager.ts
      AudioCapture.ts
    /transcription
      CloudTranscriber.ts
      TranscriptionTypes.ts
    /intent
      QuestionDetector.ts
      IntentTypes.ts
    /session
      AudioSessionController.ts
    index.ts

Backend
/apps/backend
  /src
    /modules
      /auth
      /workspaces
      /calls
      /transcripts
      /knowledge
      /retrieval
      /llm
      /audit
    /platform
      /http
      /auth-middleware
      /validation
    /integrations
      /llm
      /transcription
    /api
    /services
    index.ts

BACKEND STRUCTURE RULES:
- /platform: Infrastructure concerns only (HTTP layer, middleware, validation).
- /integrations: External service adapters only (LLM providers, transcription providers).
- There is NO /shared folder. If you need shared logic, it belongs in a module.

10. SPEC-DRIVEN DEVELOPMENT RULES (IMPORTANT)

These are the rules you give Gemini or any AI.

Rule 1

Do not invent features not listed in the V1 scope.

Rule 2

Do not cross module boundaries.

Rule 3

All logic must be event driven.

Rule 4

All external APIs must be wrapped in adapters.

Rule 5

If a requirement is ambiguous, fail closed.

Rule 6

Retrieval may only read from knowledge read-models or embeddings, never mutate or enrich source documents.

11. HOW TO PROMPT GEMINI (COPY THIS)

You can literally paste this:

“You are implementing a V1 desktop sales copilot.
Follow the provided spec strictly.
Do not add features outside scope.
Respect the folder structure.
Keep modules isolated.
Implement only cloud transcription.
Assume Windows only.
Prioritize stability over optimization.
If uncertain, ask instead of assuming.”

This alone will prevent 80 percent of AI mistakes.

12. V1 SUCCESS CRITERIA

V1 is successful if:

Audio capture is reliable.

Suggestions appear automatically.

Transcripts are accurate.

Salespeople can ignore the app without friction.

Security review does not block deployment.

Nothing else matters initially.

Backend Architecture Decision (V1)

The backend for V1 is a modular monolith.

This means:

There is one deployable backend service.

All backend modules run in the same process.

Modules are logically isolated by folders and interfaces.

Modules may not directly access each other’s data.

All inter-module communication happens through defined service interfaces.

This does not mean:

A single giant file.

Shared global state.

Random cross-imports.

Shared database writes without ownership.