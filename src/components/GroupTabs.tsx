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
      <div className="flex min-w-max gap-2 rounded-lg bg-white p-1 shadow-sm md:inline-flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`min-h-10 rounded-md px-4 text-sm font-semibold ${
              activeTab === tab.id ? 'bg-teal-700 text-white' : 'text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
