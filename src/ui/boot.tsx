/** Shared page bootstrap: tokens, theme before paint, then mount. */
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import { initTheme } from './theme';

export function mount(node: ReactNode): void {
  void initTheme();
  const root = document.getElementById('root');
  if (root) createRoot(root).render(node);
}
