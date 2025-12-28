# Selly Integration Architecture

This document describes how all components of the Selly sales copilot system integrate and communicate.

## System Overview

Selly consists of three main components:

1. **Desktop App** (Tauri + React) - UI and orchestration
2. **Agent** (Node.js) - Audio capture and streaming transcription
3. **Backend** (Node.js + Express) - LLM processing, knowledge retrieval, and data persistence

```
┌─────────────────────────────────────────────────────────────────┐
│                         DESKTOP APP                              │
│                    (Tauri + React + TypeScript)                  │
│                                                                   │
│  - Session management UI                                         │
│  - Live transcript display                                       │
│  - Real-time recommendations display                             │
│  - Post-call insights dashboard                                  │
└────────┬─────────────────────────────────────┬──────────────────┘
         │                                     │
         │ HTTP                                │ SSE (EventSource)
         │                                     │
         │                                     │
    ┌────▼────────────────────┐         ┌─────▼──────────────────┐
    │      AGENT              │         │      BACKEND           │
    │   (Node.js + Rust)      │         │   (Node.js + Express)  │
    │                         │         │                        │
    │  - Audio capture        │◄────────┤  - LLM processing      │
    │  - Deepgram streaming   │  HTTP   │  - Knowledge retrieval │
    │  - Question detection   ├────────►│  - Signal extraction   │
    │  - SSE transcript       │         │  - Job processing      │
    │    streaming            │         │  - Supabase storage    │
    └────────┬────────────────┘         └────────────────────────┘
             │                                     │
             │ WebSocket                           │ HTTP
             │                                     │
        ┌────▼────────┐                      ┌────▼────────┐
        │  Deepgram   │                      │  Supabase   │
        │  Live API   │                      │  Storage    │
        └─────────────┘                      └─────────────┘
                                                   │
                                              ┌────▼────────┐
                                              │   OpenAI    │
                                              │  API (LLM)  │
                                              └─────────────┘
```

---

## Data Flow: Live Recommendations

This is the critical path for real-time assistance during active calls.

### Step-by-Step Flow

```
1. USER STARTS CALL
   Desktop → Backend: POST /api/calls/start
   ← Returns: { sessionId }

   Desktop → Agent: POST /capture/start { sessionId }
   ← Starts: Rust sidecar + WAV recording

2. AUDIO STREAMING (Continuous)
   Agent (Rust sidecar) → Outputs PCM frames to stdout
   Agent (Node.js) → Reads PCM, forwards to Deepgram WebSocket

3. TRANSCRIPTION (Real-time)
   Deepgram → Agent: Partial transcripts (interim)
   Deepgram → Agent: Final transcripts (is_final: true)

   Agent → Desktop: SSE stream at /capture/{sessionId}/transcript-stream
   Desktop: Displays live transcript in UI

4. QUESTION DETECTION (Agent-side)
   Agent receives final transcript
   → QuestionDetector.detect(text)
   → If confidence > 0.6: QUESTION DETECTED

5. TRIGGER RECOMMENDATIONS (Agent → Backend)
   Agent → Backend: POST /api/calls/{sessionId}/trigger-recommendations
   Body: {
     question: "detected question text",
     recentTranscript: [...last 20 utterances],
     timestamp: 123456789
   }

6. GENERATE RECOMMENDATIONS (Backend)
   a. Check cache for duplicate question (hash-based, 1min TTL)
   b. Build lightweight context from recent transcript
   c. Extract deterministic signals (Step 3A)
   d. Classify AI signals using LLM (Step 3B)
   e. Retrieve relevant knowledge chunks (vector search, top 3)
   f. Generate recommendations using LLM (Step 4)
   g. Cache result
   h. Broadcast via SSE

7. BROADCAST TO DESKTOP (Backend → Desktop)
   Backend → All connected Desktop clients: SSE event
   Event type: 'recommendation.generated'
   Payload: {
     title: "...",
     message: "...",
     priority: "high|medium|low",
     category: "answer|objection|next-step"
   }

8. DISPLAY RECOMMENDATIONS
   Desktop receives SSE event
   → Updates UI with new recommendation card
   → User sees suggestion in < 3 seconds
```

### Critical Timing

- Audio capture to Deepgram: **< 100ms** (streaming)
- Deepgram to partial transcript: **< 1 second**
- Question detection: **< 50ms** (pattern matching)
- Backend recommendation generation: **2-3 seconds** (LLM call)
- **Total latency target: < 3 seconds** from question spoken to recommendation displayed

---

## Data Flow: Post-Call Processing

Asynchronous processing after call ends.

### Step-by-Step Flow

```
1. USER STOPS CALL
   Desktop → Agent: POST /capture/stop { sessionId }
   Agent: Stops Rust sidecar, finalizes WAV file
   ← Returns: { outputPath, bytesWritten, fileBase64 }

   Agent closes SSE transcript stream

2. UPLOAD AUDIO
   Desktop → Backend: POST /uploads/sign { sessionId, contentType }
   ← Returns: { signedUrl, objectPath }

   Desktop → Supabase: PUT {signedUrl} (uploads WAV file)

3. STOP CALL SESSION
   Desktop → Backend: POST /api/calls/{sessionId}/stop
   Body: { audioObjectPath }
   Backend: Updates call record, marks as ended

4. ENQUEUE PROCESSING JOB
   Desktop → Backend: POST /api/calls/{sessionId}/process
   Body: { audioObjectPath }

   Backend creates job in Supabase jobs table:
   {
     call_id: sessionId,
     workspace_id: "...",
     audio_object_path: "...",
     status: "pending",
     max_attempts: 3
   }

5. JOB WORKER PICKS UP JOB
   Worker polls every 2 seconds
   → Claims next pending job (UPDATE ... WHERE status='pending' LIMIT 1)
   → Updates status to 'processing'

6. PIPELINE EXECUTION
   a. Download audio from Supabase Storage
   b. Transcribe with Deepgram (prerecorded API)
   c. Convert transcript to domain events
   d. Run reducer to build conversation state (Step 2)
   e. Serialize context for AI (Step 2.5)
   f. Extract deterministic signals (Step 3A)
   g. Classify AI signals with LLM (Step 3B)
   h. Generate recommendations with LLM (Step 4)
   i. Generate summary with LLM

7. STORE RESULTS
   Backend stores in Supabase:
   - Utterances table (transcript)
   - Summaries table
   - Signals_3a table (deterministic)
   - Signals_3b table (AI classified)
   - Recommendations table
   - Events table (for replay)

   Updates call record: status = 'ended'
   Updates job record: status = 'completed'

8. FETCH INSIGHTS
   Desktop → Backend: GET /api/calls/{sessionId}/insights
   ← Returns: {
     transcript: [...],
     summary: "...",
     signals3a: {...},
     signals3b: {...},
     recommendations: {...}
   }

   Desktop displays in post-call dashboard
```

### Job Processing

- **Polling interval**: 2 seconds
- **Stale job requeue**: Every 60 seconds (jobs stuck in 'processing' for > 5 min)
- **Max retries**: 3 attempts
- **Retry strategy**: Retryable errors (rate limits, timeouts) vs permanent errors (validation)

---

## API Contracts

### Desktop ↔ Agent

#### POST /capture/start
**Request:**
```json
{
  "sessionId": "uuid-v4"
}
```
**Response:**
```json
{
  "ok": true,
  "sessionId": "uuid-v4",
  "outputPath": "/path/to/recordings/uuid-v4.wav"
}
```

#### POST /capture/stop
**Request:**
```json
{
  "sessionId": "uuid-v4"
}
```
**Response:**
```json
{
  "ok": true,
  "sessionId": "uuid-v4",
  "outputPath": "/path/to/recordings/uuid-v4.wav",
  "bytesWritten": 12345678,
  "fileBase64": "base64-encoded-wav-data"
}
```

#### GET /capture/{sessionId}/transcript-stream (SSE)
**Events:**
```json
{
  "type": "connection-established" | "partial" | "final" | "session-closed" | "error",
  "sessionId": "uuid-v4",
  "timestamp": 1234567890,
  "text": "transcript text",
  "confidence": 0.95,
  "speaker": "rep" | "prospect" | "unknown",
  "startTime": 1000,
  "endTime": 2000
}
```

---

### Desktop ↔ Backend

#### POST /api/calls/start
**Request:**
```json
{
  "workspaceId": "uuid-v4"  // optional, defaults to default workspace
}
```
**Response:**
```json
{
  "ok": true,
  "sessionId": "uuid-v4",
  "workspaceId": "uuid-v4",
  "createdAt": 1234567890
}
```

#### POST /api/uploads/sign
**Request:**
```json
{
  "sessionId": "uuid-v4",
  "contentType": "audio/wav"
}
```
**Response:**
```json
{
  "ok": true,
  "sessionId": "uuid-v4",
  "signedUrl": "https://supabase-storage-url/...",
  "objectPath": "calls/workspace-id/session-id/audio.wav",
  "token": "upload-token"
}
```

#### POST /api/calls/{sessionId}/stop
**Request:**
```json
{
  "audioObjectPath": "calls/workspace-id/session-id/audio.wav"
}
```
**Response:**
```json
{
  "ok": true,
  "sessionId": "uuid-v4",
  "audioObjectPath": "calls/workspace-id/session-id/audio.wav",
  "message": "Call stopped. Use POST /api/calls/:sessionId/process to process audio."
}
```

#### POST /api/calls/{sessionId}/process
**Request:**
```json
{
  "audioObjectPath": "calls/workspace-id/session-id/audio.wav"
}
```
**Response:**
```json
{
  "ok": true,
  "sessionId": "uuid-v4",
  "jobId": "job-uuid",
  "status": "pending",
  "isNew": true,
  "message": "Job enqueued for processing"
}
```

#### GET /api/calls/{sessionId}/insights
**Response:**
```json
{
  "ok": true,
  "sessionId": "uuid-v4",
  "status": "completed",
  "transcript": [
    {
      "speaker": "rep",
      "text": "...",
      "confidence": 0.95,
      "startedAt": 1234567890,
      "endedAt": 1234567895
    }
  ],
  "summary": "Call summary text",
  "signals3a": { /* deterministic signals */ },
  "signals3b": { /* AI classified signals */ },
  "recommendations": { /* LLM recommendations */ },
  "metadata": {
    "createdAt": 1234567890,
    "endedAt": 1234567900,
    "workspaceId": "uuid-v4",
    "audioPath": "...",
    "error": null
  }
}
```

#### GET /api/calls/{sessionId}/recommendations-stream (SSE)
**Events:**
```json
{
  "type": "connection-established" | "recommendation.generated",
  "sessionId": "uuid-v4",
  "timestamp": 1234567890,
  "recommendation": {
    "title": "Recommendation title",
    "message": "Detailed recommendation text",
    "priority": "high" | "medium" | "low",
    "category": "answer" | "objection" | "next-step"
  }
}
```

---

### Agent ↔ Backend

#### POST /api/calls/{sessionId}/trigger-recommendations
**Request:**
```json
{
  "question": "What is your pricing model?",
  "recentTranscript": [
    {
      "speaker": "prospect",
      "text": "...",
      "confidence": 0.95,
      "startedAt": 1234567890,
      "endedAt": 1234567895
    }
  ],
  "timestamp": 1234567890
}
```
**Response:**
```json
{
  "ok": true,
  "cached": false,
  "latencyMs": 2345,
  "recommendationCount": 3,
  "error": null
}
```

---

### Knowledge Management

#### POST /api/workspaces/{workspaceId}/knowledge
**Request:**
```json
{
  "title": "Product Pricing Guide",
  "content": "Full markdown or text content...",
  "description": "Optional description",
  "sourceType": "manual" | "upload" | "api",
  "metadata": {
    "tags": ["pricing", "sales"],
    "author": "..."
  }
}
```
**Response:**
```json
{
  "ok": true,
  "document": {
    "id": "doc-uuid",
    "title": "Product Pricing Guide",
    "description": "...",
    "sourceType": "manual",
    "status": "indexed",
    "chunkCount": 12,
    "createdAt": 1234567890
  }
}
```

#### GET /api/workspaces/{workspaceId}/knowledge
**Response:**
```json
{
  "ok": true,
  "documents": [
    {
      "id": "doc-uuid",
      "title": "...",
      "description": "...",
      "sourceType": "manual",
      "status": "indexed",
      "chunkCount": 12,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ],
  "count": 5
}
```

---

## Environment Variables

### Agent (`/apps/agent/.env`)
```bash
DEEPGRAM_API_KEY=your_key_here
BACKEND_URL=http://localhost:3000
AGENT_PORT=3001
```

### Backend (`/apps/backend/.env`)
```bash
DEEPGRAM_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key_here
PORT=3000
```

### Desktop (`/apps/desktop/.env`)
```bash
VITE_BACKEND_URL=http://localhost:3000
VITE_AGENT_URL=http://localhost:3001
```

---

## Error Handling & Resilience

### Agent
- **Sidecar crash**: Detected via process exit event, stops gracefully
- **Deepgram disconnect**: Auto-reconnect with exponential backoff (max 5 attempts)
- **Backend unavailable**: Logs error, continues transcription, retries recommendation trigger
- **SSE client disconnect**: Automatic cleanup, no memory leaks

### Backend
- **Deepgram API failure**: Job marked as retryable, requeued with exponential backoff
- **OpenAI API failure**: Job marked as retryable if rate limit/timeout, permanent if validation error
- **Supabase unavailable**: Falls back to in-memory store, logs warning
- **Job stale detection**: Requeues jobs stuck in 'processing' for > 5 minutes
- **Cache TTL**: 1 minute for live recommendations (prevents duplicate LLM calls)

### Desktop
- **Agent unreachable**: Shows error banner, disables recording
- **Backend unreachable**: Shows error banner, caches local state
- **SSE disconnect**: Auto-reconnect with EventSource built-in retry
- **File upload failure**: Shows retry button, preserves local WAV file

---

## Logging Strategy

### Log Levels
- **[capture]**: Audio capture lifecycle
- **[sse]**: SSE connection management
- **[deepgram]**: Deepgram WebSocket events
- **[streamCapture]**: Streaming integration
- **[pipeline]**: Post-call processing pipeline
- **[live-recs]**: Live recommendation generation
- **[worker]**: Job worker processing
- **[api]**: HTTP API requests

### No Secrets in Logs
- API keys are NEVER logged
- Only masked/truncated identifiers are logged
- Transcript text is logged for debugging but can be disabled

---

## Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Audio capture startup | < 500ms | ~200ms |
| Deepgram connection | < 2s | ~1s |
| Partial transcript latency | < 1s | ~500ms |
| Question detection | < 100ms | ~50ms |
| Live recommendation (cached) | < 100ms | ~50ms |
| Live recommendation (uncached) | < 3s | ~2.5s |
| Post-call job pickup | < 5s | ~2s (poll interval) |
| Full pipeline processing (5 min call) | < 2 min | ~60-90s |

---

## Testing Integration Points

### Manual Test: Live Recommendations
1. Start backend: `cd apps/backend && npm start`
2. Start agent: `cd apps/agent && npm start`
3. Start desktop: `cd apps/desktop && npm run tauri dev`
4. In desktop: Click "Start Recording"
5. Speak into mic: "What is your pricing model?"
6. Within 3 seconds, recommendation should appear in UI
7. Check logs for complete flow:
   - Agent detects question
   - Agent calls backend trigger-recommendations
   - Backend generates recommendations
   - Backend broadcasts SSE event
   - Desktop receives and displays

### Manual Test: Post-Call Processing
1. Complete a recording session
2. Click "Stop Recording"
3. Wait for upload to complete
4. Click "Process Call"
5. Job should appear in backend logs
6. After ~60s, insights should be available
7. Navigate to post-call dashboard
8. Verify transcript, summary, signals, recommendations

---

## Troubleshooting

### No transcripts appearing
- Check DEEPGRAM_API_KEY in agent .env
- Check Deepgram WebSocket connection in agent logs
- Verify audio is being captured (check sidecar logs)

### No recommendations appearing
- Check OPENAI_API_KEY in backend .env
- Check backend /trigger-recommendations endpoint logs
- Verify SSE connection in browser DevTools > Network > EventStream
- Check question detection confidence in agent logs

### Post-call processing stuck
- Check job status: query Supabase jobs table
- Check worker logs for errors
- Verify Supabase credentials
- Check audio file exists in Supabase Storage

### High latency
- Check network latency to Deepgram
- Check OpenAI API response times
- Verify no rate limiting (429 errors)
- Check system resources (CPU, memory)

---

## Security Considerations

1. **API Keys**: Stored in .env files, NEVER committed to git
2. **Workspace Isolation**: All data scoped to workspaceId, enforced at DB level
3. **Audio Privacy**: Audio files stored in Supabase with workspace-scoped access
4. **SSE Authentication**: Currently open for localhost, should add auth tokens in production
5. **CORS**: Configured for localhost development, restrict in production
6. **Service Role Key**: Backend uses Supabase service role key, has full access - secure this

---

## Next Steps

1. Add authentication to SSE streams
2. Implement workspace-based authorization middleware
3. Add metrics/observability (Prometheus, Grafana)
4. Implement retry queues for failed jobs (dead letter queue)
5. Add E2E integration tests
6. Optimize LLM prompts for lower latency
7. Implement streaming LLM responses for faster TTFB
