// API Contracts
// Shared request/response shapes for Backend API
// 
// RULES (from SPEC.md):
// - No logic
// - No helpers
// - No data access
// - Only interfaces, types, and enums
// ============================================
// ENUMS
// ============================================
export var CallStatus;
(function (CallStatus) {
    CallStatus["ACTIVE"] = "active";
    CallStatus["COMPLETED"] = "completed";
    CallStatus["FAILED"] = "failed";
})(CallStatus || (CallStatus = {}));
