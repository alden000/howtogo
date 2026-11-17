/** Captures `beforeinstallprompt` so Settings can offer "安装到主屏幕 / Add to Home screen". */
import { signal } from '@preact/signals';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
export const canInstall = signal(false);

export function captureInstallPrompt(win: Window = window): void {
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    canInstall.value = true;
  });
  win.addEventListener('appinstalled', () => {
    deferred = null;
    canInstall.value = false;
  });
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  canInstall.value = false;
  return outcome === 'accepted';
}
