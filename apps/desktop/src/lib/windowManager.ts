// Window Manager Utility
// Manages opening/closing the overlay window using Tauri's WebviewWindow API

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

let overlayWindow: WebviewWindow | null = null;

/**
 * Opens the overlay window if not already open
 * @param sessionId - Current recording session ID for context
 */
export async function openOverlayWindow(sessionId: string): Promise<void> {
    // Check if window already exists
    const existing = await WebviewWindow.getByLabel('overlay');
    if (existing) {
        await existing.show();
        await existing.setFocus();
        overlayWindow = existing;
        return;
    }

    // Create new overlay window
    overlayWindow = new WebviewWindow('overlay', {
        url: `/#/overlay?sessionId=${sessionId}`,
        title: 'Selly Overlay',
        width: 380,
        height: 520,
        decorations: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        x: 50,
        y: 100,
    });

    overlayWindow.once('tauri://created', () => {
        console.log('[windowManager] Overlay window created');
    });

    overlayWindow.once('tauri://error', (e) => {
        console.error('[windowManager] Failed to create overlay window:', e);
        overlayWindow = null;
    });
}

/**
 * Closes the overlay window if open
 */
export async function closeOverlayWindow(): Promise<void> {
    if (overlayWindow) {
        try {
            await overlayWindow.close();
        } catch (err) {
            console.warn('[windowManager] Error closing overlay:', err);
        }
        overlayWindow = null;
    }

    // Also try to close by label in case reference was lost
    try {
        const existing = await WebviewWindow.getByLabel('overlay');
        if (existing) {
            await existing.close();
        }
    } catch {
        // Ignore if already closed
    }
}

/**
 * Shows/hides the overlay window
 */
export async function toggleOverlayWindow(visible: boolean): Promise<void> {
    const window = overlayWindow || await WebviewWindow.getByLabel('overlay');
    if (window) {
        if (visible) {
            await window.show();
        } else {
            await window.hide();
        }
    }
}
