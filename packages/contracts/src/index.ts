// Selly Contracts
// Shared type-level contracts for Desktop, Agent, and Backend
// 
// RULES (from SPEC.md):
// - No logic
// - No helpers
// - No data access
// - Only DTOs, event schemas, request/response shapes
// - If something needs logic, it lives in a module, not here

export * from './events/index.js';
export * from './ipc/index.js';
export * from './api/index.js';
