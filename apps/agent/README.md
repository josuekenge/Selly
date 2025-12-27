# Selly Local Agent

Node.js + TypeScript local background process for V1 Sales Copilot.

## Prerequisites

- **Node.js** (v18+)
- **npm**

## Getting Started

```bash
# Install dependencies
npm install

# Build and run
npm run dev

# Or build separately
npm run build
npm start
```

## Project Structure

```
/apps/agent
├── package.json
├── tsconfig.json
└── /src
    ├── index.ts              # Entry point
    ├── /audio
    │   ├── AudioDeviceManager.ts
    │   ├── AudioCapture.ts
    │   └── index.ts
    ├── /transcription
    │   ├── CloudTranscriber.ts
    │   ├── TranscriptionTypes.ts
    │   └── index.ts
    ├── /intent
    │   ├── QuestionDetector.ts
    │   ├── IntentTypes.ts
    │   └── index.ts
    └── /session
        ├── AudioSessionController.ts
        └── index.ts
```

## Responsibilities (per SPEC.md)

- Audio capture and device management
- Transcription streaming to cloud providers
- Local question detection
- Session lifecycle management

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript (ES2022 target)
- **Module System**: ESM (NodeNext)
