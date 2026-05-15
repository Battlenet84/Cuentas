export type GroupTab = 'summary' | 'movements' | 'people' | 'settings';

type GroupTabsProps = {
  activeTab: GroupTab;
  onTabChange: (tab: GroupTab) => void;
};

const tabs: Array<{ id: GroupTab; label: string }> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'movements', label: 'Movimientos' },
  { id: 'people', label: 'Personas' },
  { id: 'settings', label: 'Ajustes' }
];

export function GroupTabs({ activeTab, onTabChange }: GroupTabsProps) {
  return (
    <nav className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Secciones del grupo">
      <div className="flex min-w-max gap-1 border-b border-slate-200 md:inline-flex" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative min-h-11 px-4 text-sm font-semibold transition ${
              activeTab === tab.id
                ? 'text-slate-950 after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-teal-700'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
