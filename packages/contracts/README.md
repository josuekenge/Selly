# Selly Contracts

Shared type-level contracts for Desktop, Agent, and Backend.

## Purpose

This package contains **only type definitions**:
- Interfaces
- Types
- Enums

**No runtime code. No logic. No helpers.**

## Usage

```typescript
import { CallStartedEvent, IPCChannel, GetSuggestionRequest } from '@selly/contracts';
```

## Structure

```
/packages/contracts
├── package.json
├── tsconfig.json
└── /src
    ├── index.ts          # Re-exports all contracts
    ├── /events           # Domain event schemas
    ├── /ipc              # IPC message shapes
    └── /api              # REST API request/response types
```

## Build

```bash
npm install
npm run build
```

## Rules (from SPEC.md)

- No logic
- No helpers
- No data access
- Only DTOs, event schemas, request/response shapes
- If something needs logic, it lives in a module, not here
