/** Shared page bootstrap: tokens, theme before paint, then mount inside the motion shell. */
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import { Shell } from './kit';
import { initTheme } from './theme';
import { Toasts } from './toast';

export function mount(node: ReactNode): void {
  void initTheme();
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <Shell>
        {node}
        <Toasts />
      </Shell>,
    );
  }
}
