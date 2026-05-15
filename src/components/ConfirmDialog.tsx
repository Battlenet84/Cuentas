import { Icon, SheetHandle } from './ui';

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'default',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:p-4">
      <section className="cc-bottom-sheet sm:max-w-md" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <SheetHandle />
        <div className="flex items-start gap-3">
          <span className={`cc-icon-tile ${tone === 'danger' ? 'bg-[var(--cc-negative-soft)] text-[var(--cc-negative)]' : 'bg-[var(--cc-primary-soft)] text-[var(--cc-primary)]'}`}>
            <Icon name={tone === 'danger' ? 'x' : 'check'} size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="serif text-2xl font-semibold tracking-[-0.02em] text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onCancel} className="cc-button-secondary">
            {cancelLabel}
          </button>
          <button type="button" onClick={() => void onConfirm()} className={tone === 'danger' ? 'cc-button-danger min-h-12 bg-[var(--cc-negative-soft)]' : 'cc-button-primary'}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
