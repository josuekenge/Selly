const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const AGENT_URL = import.meta.env.VITE_AGENT_URL || 'http://localhost:3001';

if (!BACKEND_URL) {
  throw new Error('VITE_BACKEND_URL is required');
}

export async function startCall(): Promise<{ sessionId: string }> {
  const res = await fetch(`${BACKEND_URL}/api/calls/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`startCall failed: ${res.status}`);
  return await res.json();
}

export async function agentStartCapture(sessionId: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/capture/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  if (!res.ok) throw new Error(`agentStartCapture failed: ${res.status}`);
}

export async function agentStopCapture(sessionId: string): Promise<{ outputPath: string; bytesWritten?: number }> {
  const res = await fetch(`${AGENT_URL}/capture/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  if (!res.ok) throw new Error(`agentStopCapture failed: ${res.status}`);
  const data = await res.json();

  if (!data.outputPath) {
    throw new Error('Agent stop response missing outputPath');
  }

  return data;
}

interface SignUploadArgs {
  sessionId: string;
  contentType: string;
  fileName: string;
}

interface NormalizedSignedUpload {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  objectPath: string;
}

export async function signUpload(args: SignUploadArgs): Promise<NormalizedSignedUpload> {
  const res = await fetch(`${BACKEND_URL}/api/uploads/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(`signUpload failed: ${res.status}`);

  const data = await res.json();

  if (data.method === 'PUT' && data.url && data.objectPath) {
    return {
      method: 'PUT',
      url: data.url,
      headers: data.headers || {},
      objectPath: data.objectPath
    };
  }

  if (data.signedUrl && data.objectPath) {
    return {
      method: 'PUT',
      url: data.signedUrl,
      headers: {},
      objectPath: data.objectPath
    };
  }

  throw new Error('Unsupported signUpload response shape');
}

export async function uploadToSignedUrl(
  signed: NormalizedSignedUpload,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const headers = {
    ...signed.headers,
    'Content-Type': contentType
  };

  const res = await fetch(signed.url, {
    method: signed.method,
    headers,
  body: bytes as unknown as BodyInit
  });

  if (!res.ok) throw new Error(`uploadToSignedUrl failed: ${res.status}`);
}

export async function stopCall(sessionId: string, objectPath: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/calls/${sessionId}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioObjectPath: objectPath })
  });
  if (!res.ok) throw new Error(`stopCall failed: ${res.status}`);

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'stopCall returned ok: false');
}

export async function processCall(sessionId: string, objectPath: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/calls/${sessionId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioObjectPath: objectPath })
  });
  if (!res.ok) throw new Error(`processCall failed: ${res.status}`);

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'processCall returned ok: false');
}

export async function getInsights(sessionId: string): Promise<unknown> {
  const res = await fetch(`${BACKEND_URL}/api/calls/${sessionId}/insights`);
  if (!res.ok) throw new Error(`getInsights failed: ${res.status}`);
  return await res.json();
}
