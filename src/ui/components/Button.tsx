/**
 * Buttons as explicit variants (composition pattern: no boolean "primary"/"danger" props).
 * Token classes only; sizes follow DESIGN.md (32 px tall, 8 px radius, button type style).
 * Loading keeps the label, prepends a spinner, sets `aria-busy` and stays the same width.
 * React 19: `ref` is an ordinary prop, so there is no forwardRef.
 */
import type { ComponentProps } from 'react';
import { Spinner } from '../kit';

const BASE =
  'inline-flex h-8 items-center justify-center gap-2 rounded-sm px-3 text-button font-ui whitespace-nowrap ' +
  'transition-[background-color,color,transform] duration-100 active:scale-[0.97] ' +
  'disabled:opacity-50 disabled:active:scale-100';

function join(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = ComponentProps<'button'> & { busy?: boolean };

function make(tone: string) {
  return function Variant({ className, busy, children, disabled, ...rest }: ButtonProps) {
    return (
      <button
        type="button"
        {...rest}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={join(BASE, tone, className)}
      >
        {busy ? <Spinner /> : null}
        {children}
      </button>
    );
  };
}

export const PrimaryButton = make('bg-accent text-on-accent hover:bg-accent-hover');
export const SecondaryButton = make('bg-surface-2 text-fg hover:bg-surface-3');
export const GhostButton = make('bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg');
export const DangerButton = make('bg-danger-soft text-danger hover:brightness-95');
