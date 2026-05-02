export type GroupTab = 'summary' | 'expenses' | 'participants' | 'more';

type GroupBottomNavProps = {
  activeTab: GroupTab;
  onTabChange: (tab: GroupTab) => void;
  onAddExpense: () => void;
};

const tabs: Array<{ id: GroupTab; label: string }> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'expenses', label: 'Gastos' },
  { id: 'participants', label: 'Participantes' },
  { id: 'more', label: 'Más' }
];

export function GroupBottomNav({ activeTab, onTabChange, onAddExpense }: GroupBottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-2 pt-2 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
      aria-label="Navegación del grupo"
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 items-end gap-1">
        {tabs.slice(0, 2).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`min-h-12 rounded-md px-1 text-xs font-semibold ${
              activeTab === tab.id ? 'bg-teal-50 text-teal-800' : 'text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onAddExpense}
          className="min-h-14 rounded-full bg-teal-700 px-2 text-sm font-semibold text-white shadow-md"
        >
          Agregar
        </button>
        {tabs.slice(2).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`min-h-12 rounded-md px-1 text-xs font-semibold ${
              activeTab === tab.id ? 'bg-teal-50 text-teal-800' : 'text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
