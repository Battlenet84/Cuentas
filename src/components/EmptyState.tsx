import type { ReactNode } from 'react';
import { Icon } from './ui';

type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: 'users' | 'receipt' | 'check' | 'search' | 'lock' | 'plus' | 'settings';
  action?: ReactNode;
};

export function EmptyState({ title, description, actionLabel, onAction, icon = 'receipt', action }: EmptyStateProps) {
  return (
    <div className="cc-card border-dashed px-6 py-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm">
        <Icon name={icon} size={26} />
      </div>
      <p className="mt-4 text-lg font-semibold text-slate-900">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className="cc-button-primary mt-4">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
