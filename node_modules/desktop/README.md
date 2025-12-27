# Selly Desktop Shell

Tauri + React + TypeScript desktop application for V1 Sales Copilot.

## Prerequisites

- **Node.js** (v18+)
- **Rust** (install from https://rustup.rs/)
- **npm**

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
/apps/desktop
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── /src                  # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   └── App.css
└── /src-tauri            # Rust Tauri shell
    ├── Cargo.toml
    ├── tauri.conf.json
    └── /src
        ├── main.rs
        └── lib.rs
```

## Tech Stack

- **Frontend**: React 19, TypeScript
- **Bundler**: Vite 7
- **Desktop Shell**: Tauri 2 (Rust)
- **Target OS**: Windows

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
