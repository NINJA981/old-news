import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallPrompt {
  available: boolean;
  prompt: () => Promise<void>;
}

/** Captures the browser's install prompt so the app can offer it inline (never on first visit). */
export function useInstallPrompt(): InstallPrompt {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event): void => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = (): void => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return {
    available: evt !== null,
    async prompt() {
      if (!evt) return;
      await evt.prompt();
      await evt.userChoice.catch(() => undefined);
      setEvt(null);
    },
  };
}
