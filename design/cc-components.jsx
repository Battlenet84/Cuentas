// Cuentas Claras — UI primitive components
// Reusable atoms used across screens. All assume tokens.css is loaded.

const { useState, useRef, useEffect } = React;

// ——— Icon set (inline SVGs, 1.5px stroke) ———
const Icon = ({ name, size = 18, color = 'currentColor', className = '' }) => {
  const s = size;
  const props = {
    width: s, height: s, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    className,
  };
  switch (name) {
    case 'plus':     return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'minus':    return <svg {...props}><path d="M5 12h14"/></svg>;
    case 'check':    return <svg {...props}><path d="M5 12.5l4.5 4.5L19 7"/></svg>;
    case 'x':        return <svg {...props}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'chevron-r':return <svg {...props}><path d="M9 5l7 7-7 7"/></svg>;
    case 'chevron-l':return <svg {...props}><path d="M15 5l-7 7 7 7"/></svg>;
    case 'chevron-d':return <svg {...props}><path d="M5 9l7 7 7-7"/></svg>;
    case 'chevron-u':return <svg {...props}><path d="M5 15l7-7 7 7"/></svg>;
    case 'search':   return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>;
    case 'copy':     return <svg {...props}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
    case 'link':     return <svg {...props}><path d="M10 14a4 4 0 0 1 0-5.7l3-3a4 4 0 0 1 5.7 5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 1 0 5.7l-3 3a4 4 0 0 1-5.7-5.7l1.5-1.5"/></svg>;
    case 'user':     return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    case 'users':    return <svg {...props}><circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4a3.5 3.5 0 0 1 0 7"/><path d="M22 20a7 7 0 0 0-5-6.7"/></svg>;
    case 'wallet':   return <svg {...props}><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><circle cx="16" cy="14" r="1.4" fill="currentColor"/></svg>;
    case 'arrow-r':  return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'arrow-d':  return <svg {...props}><path d="M12 5v14M6 13l6 6 6-6"/></svg>;
    case 'mail':     return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>;
    case 'lock':     return <svg {...props}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;
    case 'eye':      return <svg {...props}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'sparkle':  return <svg {...props}><path d="M12 4v6M12 14v6M4 12h6M14 12h6"/></svg>;
    case 'receipt':  return <svg {...props}><path d="M5 3v18l3-2 2 2 2-2 2 2 2-2 3 2V3z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
    case 'history':  return <svg {...props}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>;
    case 'settings': return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case 'filter':   return <svg {...props}><path d="M3 5h18M6 12h12M10 19h4"/></svg>;
    case 'lock-closed': return <svg {...props}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;
    case 'calendar': return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>;
    case 'edit':     return <svg {...props}><path d="M14 4l6 6L8 22H2v-6z"/><path d="M14 4l3-3 6 6-3 3"/></svg>;
    case 'trash':    return <svg {...props}><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>;
    case 'more':     return <svg {...props}><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></svg>;
    case 'dot':      return <svg {...props}><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>;
    case 'flag':     return <svg {...props}><path d="M5 3v18M5 4h12l-2 4 2 4H5"/></svg>;
    case 'sun':      return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/></svg>;
    case 'home':     return <svg {...props}><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></svg>;
    case 'logout':   return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>;
    default: return null;
  }
};

// ——— Button ———
const Button = ({ variant = 'primary', size, block, leftIcon, rightIcon, children, ...rest }) => {
  const cls = [
    'cc-btn',
    `cc-btn-${variant}`,
    size === 'sm' && 'cc-btn-sm',
    block && 'cc-btn-block',
  ].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      {leftIcon && <Icon name={leftIcon} size={size === 'sm' ? 14 : 16}/>}
      {children}
      {rightIcon && <Icon name={rightIcon} size={size === 'sm' ? 14 : 16}/>}
    </button>
  );
};

// ——— Input + Field ———
const Field = ({ label, helper, error, children }) => (
  <div className="cc-field">
    {label && <label className="cc-label">{label}</label>}
    {children}
    {(helper || error) && <div className={`cc-helper ${error ? 'cc-helper-error' : ''}`}>{error || helper}</div>}
  </div>
);
const Input = ({ amount, className = '', ...rest }) => (
  <input className={`cc-input ${amount ? 'cc-input-amount' : ''} ${className}`} {...rest}/>
);
const Select = ({ children, ...p }) => (
  <div style={{ position: 'relative' }}>
    <select className="cc-select" style={{ appearance: 'none', paddingRight: 40 }} {...p}>
      {children}
    </select>
    <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--cc-ink-3)' }}>
      <Icon name="chevron-d" size={16}/>
    </div>
  </div>
);

// ——— Avatar ———
const AVATAR_PALETTE = [
  ['#E8C7B8', '#7A3A24'], ['#D9D2BC', '#5A4A1F'], ['#CFD9C0', '#3D5226'],
  ['#C8D4D9', '#234B61'], ['#E5C8C2', '#7A2C24'], ['#D8CDDB', '#4B335E'],
  ['#E0D2BC', '#6B4F1A'], ['#C4D5C8', '#2F4D3A'],
];
const Avatar = ({ name = '?', size = 36, ring }) => {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const idx = (name.charCodeAt(0) || 0) % AVATAR_PALETTE.length;
  const [bg, fg] = AVATAR_PALETTE[idx];
  return (
    <span className="cc-avatar" style={{
      width: size, height: size,
      background: bg, color: fg,
      fontSize: size * 0.42,
      boxShadow: ring ? `0 0 0 2px var(--cc-bg), 0 0 0 ${2 + 1.5}px var(--cc-line-strong)` : undefined,
    }}>{initial}</span>
  );
};

// ——— Badge ———
const Badge = ({ tone = 'neutral', children }) => (
  <span className={`cc-badge cc-badge-${tone}`}>{children}</span>
);

// ——— Chip ———
const Chip = ({ active, onClick, children }) => (
  <button className={`cc-chip ${active ? 'cc-chip-active' : ''}`} onClick={onClick}>{children}</button>
);

// ——— Segmented control ———
const Segmented = ({ value, onChange, options }) => (
  <div className="cc-seg" role="tablist">
    {options.map(o => (
      <button
        key={o.value}
        aria-selected={value === o.value}
        onClick={() => onChange?.(o.value)}>
        {o.label}
      </button>
    ))}
  </div>
);

// ——— Tabs (group nav) ———
const Tabs = ({ value, onChange, options }) => (
  <div className="cc-tabs" role="tablist">
    {options.map(o => (
      <button key={o.value} aria-selected={value === o.value} onClick={() => onChange?.(o.value)}>{o.label}</button>
    ))}
  </div>
);

// ——— Money formatter ———
const fmt = (n, currency = 'ARS') => {
  const sym = currency === 'ARS' ? '$' : currency === 'USD' ? 'US$' : currency === 'EUR' ? '€' : '$';
  const abs = Math.abs(n);
  const s = abs.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}${sym} ${s}`;
};

// ——— Section heading ———
const SectionH = ({ children, action }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginTop: 4 }}>
    <span className="cc-section-h">{children}</span>
    {action}
  </div>
);

// ——— Empty state ———
const Empty = ({ icon = 'sparkle', title, body, action }) => (
  <div className="cc-empty">
    <div className="cc-empty-art"><Icon name={icon} size={26}/></div>
    <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
    <div style={{ fontSize: 14, color: 'var(--cc-ink-3)', maxWidth: 260 }}>{body}</div>
    {action && <div style={{ marginTop: 4 }}>{action}</div>}
  </div>
);

// ——— Banner ———
const Banner = ({ tone = 'info', title, children }) => (
  <div className={`cc-banner cc-banner-${tone}`}>
    <div style={{ flexShrink: 0, marginTop: 1 }}>
      <Icon name={tone === 'warning' ? 'flag' : tone === 'error' ? 'x' : tone === 'positive' ? 'check' : 'sparkle'} size={16}/>
    </div>
    <div>
      {title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>}
      {children}
    </div>
  </div>
);

Object.assign(window, {
  Icon, Button, Field, Input, Select, Avatar, Badge, Chip, Segmented, Tabs,
  SectionH, Empty, Banner, fmt,
});
