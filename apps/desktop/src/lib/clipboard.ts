export async function copyToClipboard(text: string): Promise<void> {
  // Try browser clipboard API first
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (err) {
    console.warn('navigator.clipboard failed:', err);
  }

  // Try Tauri v2 clipboard plugin
  try {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(text);
  } catch (err) {
    console.warn('Tauri clipboard failed:', err);
    throw new Error('Clipboard not available');
  }
}

