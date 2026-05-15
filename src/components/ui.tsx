import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

type IconName =
  | 'arrow-r'
  | 'calendar'
  | 'check'
  | 'copy'
  | 'filter'
  | 'link'
  | 'lock'
  | 'more'
  | 'plus'
  | 'receipt'
  | 'search'
  | 'settings'
  | 'user'
  | 'users'
  | 'wallet'
  | 'x';

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className
  };

  switch (name) {
    case 'arrow-r':
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case 'calendar':
      return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
    case 'check':
      return <svg {...props}><path d="M5 12.5l4.5 4.5L19 7" /></svg>;
    case 'copy':
      return <svg {...props}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
    case 'filter':
      return <svg {...props}><path d="M3 5h18M6 12h12M10 19h4" /></svg>;
    case 'link':
      return <svg {...props}><path d="M10 14a4 4 0 0 1 0-5.7l3-3a4 4 0 0 1 5.7 5.7l-1.5 1.5" /><path d="M14 10a4 4 0 0 1 0 5.7l-3 3a4 4 0 0 1-5.7-5.7l1.5-1.5" /></svg>;
    case 'lock':
      return <svg {...props}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
    case 'more':
      return <svg {...props}><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>;
    case 'plus':
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case 'receipt':
      return <svg {...props}><path d="M5 3v18l3-2 2 2 2-2 2 2 2-2 3 2V3z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
    case 'search':
      return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
    case 'settings':
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    case 'user':
      return <svg {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
    case 'users':
      return <svg {...props}><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 14 0" /><path d="M16 4a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-5-6.7" /></svg>;
    case 'wallet':
      return <svg {...props}><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18" /><circle cx="16" cy="14" r="1.4" fill="currentColor" stroke="none" /></svg>;
    case 'x':
      return <svg {...props}><path d="M6 6l12 12M18 6L6 18" /></svg>;
  }
}

const avatarPalette = [
  ['#e8c7b8', '#7a3a24'],
  ['#d9d2bc', '#5a4a1f'],
  ['#cfd9c0', '#3d5226'],
  ['#c8d4d9', '#234b61'],
  ['#e5c8c2', '#7a2c24'],
  ['#d8cddb', '#4b335e']
];

export function Avatar({ name = '?', size = 36 }: { name?: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const [bg, fg] = avatarPalette[(name.charCodeAt(0) || 0) % avatarPalette.length];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.max(12, size * 0.42) }}
    >
      {initial}
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--cc-primary)] text-[var(--cc-ink-on)] shadow-sm">
        <Icon name="wallet" size={compact ? 17 : 18} />
      </span>
      <div>
        <p className="text-sm font-semibold leading-none text-slate-950">Cuentas Claras</p>
        {!compact ? <p className="mt-1 text-xs text-slate-500">Sobremesa limpia</p> : null}
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  return <span className={`cc-badge cc-badge-${tone}`}>{children}</span>;
}

export function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-3 px-1">
      <div>
        <h2 className="cc-section-h">{title}</h2>
        {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SettingsBlock({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="cc-settings-block">
      <SectionHeader title={title} sub={sub} action={action} />
      <div className="cc-settings-body">{children}</div>
    </section>
  );
}

export function MoneyDisplay({ value, label, subdued = false }: { value: string; label?: string; subdued?: boolean }) {
  return (
    <div>
      {label ? <p className="text-xs font-medium text-slate-500">{label}</p> : null}
      <p className={`num mt-1 font-semibold leading-none tracking-[-0.02em] ${subdued ? 'text-2xl text-slate-700' : 'text-4xl text-slate-950'}`}>{value}</p>
    </div>
  );
}

export function SheetHandle() {
  return <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--cc-line-strong)]" />;
}

export function Field({ label, helper, children }: { label?: ReactNode; helper?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label ? <span>{label}</span> : null}
      {children}
      {helper ? <span className="text-xs font-normal text-slate-500">{helper}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`cc-input ${props.className ?? ''}`} />;
}

export function SelectField({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`cc-input appearance-none pr-10 ${className}`}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
        <Icon name="arrow-r" size={14} className="rotate-90" />
      </span>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className = ''
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`grid gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 ${className}`} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${
            value === option.value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ChipButton({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`cc-pill min-h-9 shadow-sm transition ${active ? 'cc-chip-active' : ''}`}>
      {children}
    </button>
  );
}
