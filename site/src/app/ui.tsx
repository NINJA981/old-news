import { useId, type ReactNode } from 'react';

const ICONS = {
  read: '<path d="M2 3.5h4.5A1.5 1.5 0 0 1 8 5v8a1 1 0 0 0-1-1H2z"/><path d="M14 3.5H9.5A1.5 1.5 0 0 0 8 5v8a1 1 0 0 1 1-1h5z"/>',
  stories: '<path d="m8 2 6 3-6 3-6-3z"/><path d="m2 8 6 3 6-3"/><path d="m2 11 6 3 6-3"/>',
  settings:
    '<path d="M2 4.5h6"/><path d="M11 4.5h3"/><circle cx="9.5" cy="4.5" r="1.5"/><path d="M2 11.5h3"/><path d="M8 11.5h6"/><circle cx="6.5" cy="11.5" r="1.5"/>',
  share:
    '<path d="M8 10V2.5"/><path d="m5 5 3-2.5L11 5"/><path d="M3.5 8v4.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8"/>',
  reload: '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2.5v3h-3"/>',
  upload:
    '<path d="M8 10.5V3"/><path d="m5 5.5 3-2.7 3 2.7"/><path d="M3 11v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V11"/>',
  check: '<path d="m3 8.5 3.2 3.2L13 4.8"/>',
  alert: '<path d="M8 2.2 14.2 13H1.8z"/><path d="M8 6.5v3"/><path d="M8 11.4v.1"/>',
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.5V11"/><path d="M8 5v.1"/>',
  offline:
    '<path d="m2 2 12 12"/><path d="M5 6.5a6 6 0 0 1 2-.9"/><path d="M11 6.5A6 6 0 0 0 9 5.6"/><path d="M3 4.5a9 9 0 0 1 3-1.6"/><path d="M8 11.5v.1"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/>',
  chevron: '<path d="m4 6 4 4 4-4"/>',
  plus: '<path d="M8 3v10"/><path d="M3 8h10"/>',
  trash:
    '<path d="M3 4.5h10"/><path d="M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5"/><path d="m4.5 4.5.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8"/>',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

/** Segmented control: a real radio group (arrow keys move the choice). */
export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value} className="seg-opt">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="switch-row">
      <div className="switch-text">
        <label htmlFor={id}>{label}</label>
        {hint ? <p className="hint">{hint}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

export function Notice({
  tone,
  children,
  actions,
}: {
  tone: 'info' | 'danger' | 'success';
  children: ReactNode;
  actions?: ReactNode;
}) {
  const icon: IconName = tone === 'danger' ? 'alert' : tone === 'success' ? 'check' : 'info';
  return (
    <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon} />
      <div className="notice-body">
        <div>{children}</div>
        {actions ? <div className="notice-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Skeleton rows that mirror the reading column (bible: skeletons mirror final content). */
export function ReaderSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="on-sheet reader skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row">
          <i style={{ width: '100%' }} />
          <i style={{ width: i % 2 ? '86%' : '94%' }} />
          <i style={{ width: i % 3 === 0 ? '58%' : '72%' }} />
        </div>
      ))}
    </div>
  );
}
