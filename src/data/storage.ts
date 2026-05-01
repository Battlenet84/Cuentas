import type { AppState, Expense, Group, Participant, SettlementCycle } from '../types';

const STORAGE_KEY = 'cuentas-claras-state-v1';

export const emptyState: AppState = {
  groups: [],
  participants: [],
  expenses: [],
  settlementCycles: []
};

export function loadState(): AppState {
  if (typeof localStorage === 'undefined') return emptyState;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;

    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      participants: Array.isArray(parsed.participants) ? parsed.participants : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      settlementCycles: Array.isArray(parsed.settlementCycles) ? parsed.settlementCycles : []
    };
  } catch (error) {
    console.warn('No se pudo cargar el estado guardado.', error);
    return emptyState;
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createGroup(state: AppState, group: Group): AppState {
  return { ...state, groups: [group, ...state.groups] };
}

export function updateGroup(state: AppState, group: Group): AppState {
  return {
    ...state,
    groups: state.groups.map((item) => (item.id === group.id ? group : item))
  };
}

export function createParticipant(state: AppState, participant: Participant): AppState {
  return { ...state, participants: [...state.participants, participant] };
}

export function updateParticipant(state: AppState, participant: Participant): AppState {
  return {
    ...state,
    participants: state.participants.map((item) => (item.id === participant.id ? participant : item))
  };
}

export function createExpense(state: AppState, expense: Expense): AppState {
  return { ...state, expenses: [expense, ...state.expenses] };
}

export function updateExpense(state: AppState, expense: Expense): AppState {
  return {
    ...state,
    expenses: state.expenses.map((item) => (item.id === expense.id ? expense : item))
  };
}

export function deleteExpense(state: AppState, expenseId: string): AppState {
  return {
    ...state,
    expenses: state.expenses.filter((expense) => expense.id !== expenseId)
  };
}

export function createSettlementCycle(state: AppState, cycle: SettlementCycle): AppState {
  return { ...state, settlementCycles: [cycle, ...state.settlementCycles] };
}

export function assignSettlementCycleToExpenses(
  state: AppState,
  groupId: string,
  expenseIds: string[],
  settlementCycleId: string
): AppState {
  const ids = new Set(expenseIds);

  return {
    ...state,
    expenses: state.expenses.map((expense) =>
      expense.groupId === groupId && ids.has(expense.id)
        ? { ...expense, settlementCycleId }
        : expense
    )
  };
}
