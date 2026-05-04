type GroupBottomActionBarProps = {
  onAddExpense: () => void;
};

export function GroupBottomActionBar({ onAddExpense }: GroupBottomActionBarProps) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-4 pt-3 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      <button
        type="button"
        onClick={onAddExpense}
        className="mx-auto block min-h-12 w-full max-w-xl rounded-md bg-teal-700 px-4 text-base font-semibold text-white"
      >
        Agregar gasto
      </button>
    </div>
  );
}
