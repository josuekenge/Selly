# Selly Backend

Node.js + Express + TypeScript modular monolith for V1 Sales Copilot.

## Prerequisites

- **Node.js** (v18+)
- **npm**

## Getting Started

```bash
# Install dependencies
npm install

# Build
npm run build

# Start server
npm start

# Or build and run
npm run dev
```

## Verify Running

```bash
curl http://localhost:3000/health
# Returns: { "status": "ok", "service": "selly-backend", "version": "0.1.0" }
```

## Project Structure

```
/apps/backend
├── package.json
├── tsconfig.json
└── /src
    ├── index.ts              # Express entry point + /health
    ├── /modules
    │   ├── /auth
    │   ├── /workspaces
    │   ├── /calls
    │   ├── /transcripts
    │   ├── /knowledge
    │   ├── /retrieval        # Read-model constraint enforced
    │   ├── /llm
    │   └── /audit
    ├── /platform
    │   ├── /http
    │   ├── /auth-middleware
    │   └── /validation
    ├── /integrations
    │   ├── /llm
    │   └── /transcription
    ├── /api
    └── /services
```

## Architecture (per SPEC.md)

**Modular Monolith Rules:**
- One deployable backend service
- All modules run in the same process
- Modules are logically isolated by folders and interfaces
- Modules may not directly access each other's data
- All inter-module communication happens through defined service interfaces

**This does NOT mean:**
- A single giant file
- Shared global state
- Random cross-imports
- Shared database writes without ownership

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express 5
- **Language**: TypeScript (ES2022 target)
- **Module System**: ESM (NodeNext)
