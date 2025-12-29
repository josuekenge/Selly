# Transcription System Testing Guide

This guide will help you verify that the transcription and pause/resume functionality is working correctly.

## 🔧 Prerequisites Checklist

Before testing, ensure:

- ✅ **DEEPGRAM_API_KEY** is set in `apps/agent/.env`
- ✅ **VITE_AGENT_URL** is set in `apps/desktop/.env` (should be `http://localhost:3001`)
- ✅ **VITE_BACKEND_URL** is set in `apps/desktop/.env` (should be `http://localhost:3000`)
- ✅ **Rust sidecar** is built: `cd apps/agent && npm run build:sidecar`
- ✅ **Windows OS** (audio capture only works on Windows)

## 📋 Step-by-Step Testing

### Step 1: Run the Diagnostic Test

```bash
# From project root
node test-transcription.js
```

**Expected Output:**
```
✓ Agent /health endpoint
  - Deepgram Configured: Yes
  - Sidecar Available: Yes
✓ Agent /diagnostic endpoint
  - Deepgram Ready: Yes
  - Can Start Capture: Yes
  - Can Transcribe: Yes
```

**If you see warnings:**
- `DEEPGRAM_API_KEY not configured` → Add your Deepgram API key to `apps/agent/.env`
- `Sidecar executable not found` → Run `cd apps/agent && npm run build:sidecar`
- `Audio capture only supported on Windows` → You need Windows for audio capture

### Step 2: Start the Servers

Open **3 terminals**:

**Terminal 1 - Backend:**
```bash
cd apps/backend
npm run dev
```
Wait for: `Server listening on port 3000`

**Terminal 2 - Agent:**
```bash
cd apps/agent
npm run dev
```
Wait for: `[agent] Server listening on port 3001`

**Terminal 3 - Desktop:**
```bash
cd apps/desktop
npm run dev
```
Wait for the Vite dev server to start

### Step 3: Test Transcription in the UI

1. **Open the desktop app** (usually http://localhost:5173)

2. **Click "Start Call"**
   - You should see the recording indicator appear

3. **Check the Console Logs**
   Look for these messages in the browser console (F12):
   ```
   [api] Connecting to transcript SSE: http://localhost:3001/capture/{sessionId}/transcript-stream
   [api] SSE transcript connection OPENED
   [CallSession] Received transcript event: {type: "connection-established"}
   ```

4. **Speak into your microphone**
   - Watch the **Transcript tab** in the overlay panel
   - You should see live transcriptions appearing within 2-3 seconds
   - Partial transcripts appear in italics with "typing..."
   - Final transcripts appear in normal text

5. **Check the Agent Console**
   Look for these messages in Terminal 2:
   ```
   [capture:sessionId] ✓ Live transcription fully enabled and streaming
   [live-transcriber:sessionId] PARTIAL [rep]: Hello...
   [live-transcriber:sessionId] FINAL [rep]: Hello world
   [sse] Broadcasting final transcript to 1 client(s)
   ```

### Step 4: Test Pause/Resume

1. **Click the Pause button** (⏸️ icon in overlay panel)

   **Expected behavior:**
   - Button changes to green Play icon (▶️)
   - Status indicator changes from red "Rec" to yellow "Paused"
   - Console shows: `[CallSession] Session paused successfully`
   - Agent console shows: `[capture:sessionId] Transcription paused`

2. **Speak while paused**
   - No new transcripts should appear
   - Audio is still being captured but not transcribed

3. **Click Resume** (green ▶️ button)

   **Expected behavior:**
   - Button changes back to pause icon (⏸️)
   - Status changes from yellow "Paused" to red "Rec"
   - Console shows: `[CallSession] Session resumed successfully`
   - Transcription resumes

4. **Speak after resuming**
   - Transcripts should appear again in the Transcript tab

### Step 5: Test SSE Reconnection (Advanced)

1. **While recording, restart the agent:**
   ```bash
   # In Terminal 2 (Agent)
   Ctrl+C
   npm run dev
   ```

2. **Check browser console**
   - Should see retry messages:
   ```
   [api] Reconnecting transcript SSE in 500ms (attempt 1/10)
   [api] SSE transcript connection OPENED
   ```

3. **Speak into microphone**
   - Transcripts should resume appearing after reconnection

## 🐛 Troubleshooting

### No Transcripts Appearing

**Check 1: SSE Connection**
```bash
# In browser console
# Look for this error:
[api] SSE connection error
```
**Solution:** Make sure agent is running on port 3001

**Check 2: Deepgram Connection**
```bash
# In agent console (Terminal 2)
# Look for:
[live-transcriber:sessionId] Failed to connect to Deepgram
```
**Solutions:**
- Verify DEEPGRAM_API_KEY in `apps/agent/.env`
- Check your internet connection
- Verify Deepgram API key is valid

**Check 3: Audio Capture**
```bash
# In agent console
# Look for:
Sidecar not found at: ...
```
**Solution:** Run `cd apps/agent && npm run build:sidecar`

### Pause Button Not Working

**Check browser console for:**
```
Failed to pause: ...
```

**Common causes:**
- Agent server not running
- Session ID mismatch
- Network connectivity issues

**Solution:** Check agent console for errors

### TypeScript Errors

```bash
# Check for compilation errors
cd apps/agent && npx tsc --noEmit
cd apps/desktop && npx tsc --noEmit
```

If you see errors, the code changes may need adjustments.

## 📊 Success Criteria

✅ **Transcription Working:**
- Transcripts appear in UI within 2-3 seconds of speaking
- Partial transcripts update in real-time
- Final transcripts are properly formatted
- Speaker labels (Rep/Prospect) are correctly identified

✅ **Pause/Resume Working:**
- Pause button stops transcription
- UI shows paused state (yellow indicator, "Paused" text)
- Resume button restarts transcription
- No errors in console

✅ **SSE Stability:**
- Connection stays alive during long sessions
- Automatically reconnects if interrupted
- No memory leaks or connection buildup

## 🎯 Known Limitations

- **Windows Only:** Audio capture requires Windows OS
- **Microphone Required:** Must have working microphone
- **Internet Required:** Deepgram API needs internet connection
- **Rust Required:** Building sidecar requires Rust toolchain

## 📝 Reporting Issues

If tests fail, please provide:

1. **Output of diagnostic test:**
   ```bash
   node test-transcription.js > diagnostic.txt
   ```

2. **Browser console logs** (with errors highlighted)

3. **Agent console logs** (from Terminal 2)

4. **Environment info:**
   ```bash
   node --version
   npm --version
   rustc --version
   ```

5. **OS version:** (e.g., Windows 11, Windows 10)

---

## 🎉 If Everything Works

You should see:
- ✅ Live transcripts appearing as you speak
- ✅ Pause/resume functioning correctly
- ✅ No errors in any console
- ✅ Smooth, responsive UI updates

**Congratulations! The transcription system is fully functional.**
