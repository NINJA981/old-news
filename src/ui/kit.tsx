/**
 * Shared controls for Old News extension pages (popup, app, onboarding). Built on Radix primitives
 * for behaviour and accessibility, restyled to DESIGN.md tokens only: 8 px rectangle buttons, a
 * 2 px underline tab indicator, 20 px keycaps, label/value rows. Motion uses the shared-layout
 * indicator (`layoutId`) and the two spring tokens; keyboard actions never animate.
 */
import * as RSwitch from '@radix-ui/react-switch';
import * as RTabs from '@radix-ui/react-tabs';
import * as RTooltip from '@radix-ui/react-tooltip';
import { LazyMotion, domMax, m, MotionConfig } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';
import { useId } from 'react';
import type { TierCounts } from '../engine/types';

export const SPRING = {
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  ui: { type: 'spring', stiffness: 380, damping: 34 },
} as const;

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Wraps a page: shared-layout features and reduced-motion handling for every animation below. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax} strict>
        <RTooltip.Provider delayDuration={500} skipDelayDuration={300}>
          {children}
        </RTooltip.Provider>
      </LazyMotion>
    </MotionConfig>
  );
}

/** The product glyph: top two strokes at 40% ink, the bottom one at full ink. */
export function Glyph({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={size > 32 ? 1 : 1.5}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2 3.5h12" opacity=".4" />
      <path d="M2 8h12" opacity=".4" />
      <path d="M2 12.5h8" />
    </svg>
  );
}

// ---- Buttons -----------------------------------------------------------------------------------

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  label: string;
  shortcut?: string;
  children: ReactNode;
}

/** A 32 px icon button with an accessible label and a tooltip showing the label and its key. */
export function IconButton({ label, shortcut, children, className, ...rest }: IconButtonProps) {
  return (
    <Tip label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        {...rest}
        className={cn(
          'relative inline-flex size-8 items-center justify-center rounded-sm text-fg-muted',
          'transition-[background-color,color,transform] duration-100 hover:bg-surface-2 hover:text-fg',
          'active:scale-[0.95] after:absolute after:-inset-1',
          className,
        )}
      >
        {children}
      </button>
    </Tip>
  );
}

export function Tip({
  label,
  shortcut,
  children,
  side = 'bottom',
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-sm bg-surface-2 px-2 py-1 text-caption text-fg shadow-e3"
        >
          {label}
          {shortcut ? <Keycap>{shortcut}</Keycap> : null}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border bg-surface-2 px-[5px] font-ui text-micro text-fg-muted shadow-[inset_0_-1px_0_var(--border)]">
      {children}
    </kbd>
  );
}

// ---- Switch, segmented control, tabs --------------------------------------------------------------

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  id,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  description?: string;
  id?: string;
  disabled?: boolean;
}) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={sid} className="min-w-0 flex-1">
        <span className="block text-ui text-fg">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-caption text-fg-muted">{description}</span>
        ) : null}
      </label>
      <RSwitch.Root
        id={sid}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={cn(
          'relative h-5 w-8 shrink-0 rounded-full border transition-colors duration-150',
          checked ? 'border-accent bg-accent' : 'border-border-strong bg-transparent',
          'disabled:opacity-50',
        )}
      >
        <RSwitch.Thumb asChild>
          <m.span
            layout
            transition={SPRING.snappy}
            className={cn(
              'absolute top-[2px] block size-3.5 rounded-full',
              checked ? 'right-[2px] bg-on-accent' : 'left-[2px] bg-border-strong',
            )}
          />
        </RSwitch.Thumb>
      </RSwitch.Root>
    </div>
  );
}

/** Rect 8 px group, 2 px inner padding, selected fill `surface-3`; the indicator slides. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
}) {
  const group = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-sm border border-border bg-surface p-0.5"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative h-7 rounded-xs px-3 text-ui-strong font-ui transition-colors duration-100',
              on ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {on ? (
              <m.span
                layoutId={`seg-${group}`}
                transition={SPRING.snappy}
                className="absolute inset-0 rounded-xs bg-surface-3"
              />
            ) : null}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Notion-style underline tabs: `text-muted` at rest, `text` when active, a 2 px accent indicator. */
export function Tabs({
  value,
  onValueChange,
  tabs,
  children,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  tabs: readonly { value: string; label: string; key?: string }[];
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RTabs.List className="flex gap-4 border-b border-border" aria-label="Story views">
        {tabs.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              'relative px-1 py-2 text-ui-strong font-ui transition-colors duration-100',
              value === t.value ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
            {value === t.value ? (
              <m.span
                layoutId={`tab-${id}`}
                transition={SPRING.snappy}
                className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
              />
            ) : null}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}
export const TabPanel = RTabs.Content;

// ---- Data display --------------------------------------------------------------------------------

export const TIER_LABEL = {
  new: 'New',
  changed: 'Changed',
  similar: 'Similar',
  seen: 'Seen',
} as const;

const TIER_FILL = {
  new: 'bg-fg',
  changed: 'bg-drift',
  similar: 'bg-fg-subtle',
  seen: 'bg-border-strong',
} as const;

/** A 6 px stacked bar, radius 4 on the outer ends only. The legend carries the meaning. */
export function TierBar({ counts, className }: { counts: TierCounts; className?: string }) {
  const total = counts.new + counts.changed + counts.similar + counts.seen;
  const order = ['new', 'changed', 'similar', 'seen'] as const;
  return (
    <div
      role="img"
      aria-label={order.map((t) => `${counts[t]} ${TIER_LABEL[t].toLowerCase()}`).join(', ')}
      className={cn('flex h-1.5 w-full gap-px overflow-hidden rounded-xs bg-surface-3', className)}
    >
      {order.map((t) =>
        counts[t] > 0 ? (
          <span
            key={t}
            className={cn('h-full', TIER_FILL[t])}
            style={{ flexGrow: counts[t], flexBasis: 0 }}
          />
        ) : null,
      )}
      {total === 0 ? <span className="h-full w-full bg-surface-3" /> : null}
    </div>
  );
}

export function TierLegend({ counts }: { counts: TierCounts }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
      {(['new', 'changed', 'similar', 'seen'] as const).map((t) => (
        <div key={t} className="flex items-baseline justify-between">
          <dt className="flex items-center gap-2 text-caption text-fg-muted">
            <span aria-hidden className={cn('size-1.5 rounded-[2px]', TIER_FILL[t])} />
            {TIER_LABEL[t]}
          </dt>
          <dd className="text-ui-strong tnum">{counts[t]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label above value: the structure used wherever a middle-dot string would be tempting. */
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'drift' }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className={cn('mt-0.5 text-ui-strong tnum', tone === 'drift' && 'text-drift')}>
        {value}
      </dd>
    </div>
  );
}

/** Label above value as plain spans, for places a description list is not allowed (inside a button). */
export function InlineStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="block min-w-0">
      <span className="block text-caption text-fg-muted">{label}</span>
      <span className="mt-0.5 block text-ui-strong tnum">{value}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('on-skeleton rounded-xs bg-surface-3', className)} />;
}

export function Notice({
  tone,
  icon,
  children,
  className,
}: {
  tone: 'info' | 'danger' | 'success';
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const color = { info: 'text-info', danger: 'text-danger', success: 'text-success' }[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-sm px-3 py-2 text-ui',
        tone === 'danger' ? 'bg-danger-soft' : 'bg-surface',
        color,
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
