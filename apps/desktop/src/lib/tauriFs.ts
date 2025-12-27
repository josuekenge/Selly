export async function readFileBytes(path: string): Promise<Uint8Array> {
  try {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    return await readFile(path);
  } catch (err) {
    console.warn('Tauri fs failed:', err);
    throw new Error('Local file read not available');
  }
}

