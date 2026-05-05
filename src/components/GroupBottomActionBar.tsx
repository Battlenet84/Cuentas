type GroupBottomActionBarProps = {
  onAddExpense: () => void;
};

export function GroupBottomActionBar({ onAddExpense }: GroupBottomActionBarProps) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 shadow-[0_-12px_28px_rgba(15,23,42,0.12)] backdrop-blur md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      <button
        type="button"
        onClick={onAddExpense}
        className="cc-button-primary mx-auto block min-h-12 w-full max-w-xl text-base"
      >
        Agregar gasto
      </button>
    </div>
  );
}
