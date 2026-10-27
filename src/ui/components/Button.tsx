/**
 * Buttons as explicit variants (composition pattern: no boolean "primary"/"danger" props).
 * Token classes only; sizes follow DESIGN.md (32 px tall, 8 px radius, button type style).
 * React 19: `ref` is an ordinary prop, so there is no forwardRef.
 */
import type { ComponentProps } from 'react';

const BASE =
  'inline-flex h-8 items-center justify-center gap-2 rounded-sm px-3 text-button font-ui ' +
  'transition-transform duration-100 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100';

function join(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function PrimaryButton({ className, ...rest }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...rest}
      className={join(BASE, 'bg-accent text-on-accent hover:bg-accent-hover', className)}
    />
  );
}

export function SecondaryButton({ className, ...rest }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...rest}
      className={join(BASE, 'bg-surface-2 text-fg hover:bg-surface-3', className)}
    />
  );
}

export function GhostButton({ className, ...rest }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...rest}
      className={join(
        BASE,
        'bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
    />
  );
}

export function DangerButton({ className, ...rest }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...rest}
      className={join(BASE, 'bg-danger-soft text-danger', className)}
    />
  );
}
