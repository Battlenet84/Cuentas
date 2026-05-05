import { useMemo, useState } from 'react';
import type { ActivityLog, Expense, ExpenseSplit, Participant, SettlementCycle, SettlementPayment } from '../types';
import { formatDate, formatMovementDateGroup, movementDateKey } from '../lib/dates';
import { formatARS } from '../lib/money';
import { EmptyState } from './EmptyState';

type MovementFilter = 'all' | 'expenses' | 'payments' | 'cycles' | 'activity';
type DateFilter = 'all' | 'today' | 'last7' | 'month';

type MovementItem =
  | { type: 'expense'; date: string; sortDate: string; expense: Expense }
  | { type: 'payment'; date: string; sortDate: string; payment: SettlementPayment }
  | { type: 'cycle'; date: string; sortDate: string; cycle: SettlementCycle }
  | { type: 'activity'; date: string; sortDate: string; activity: ActivityLog };

type GroupMovementsProps = {
  expenses: Expense[];
  settlementPayments: SettlementPayment[];
  settlementCycles: SettlementCycle[];
  activityLogs: ActivityLog[];
  participants: Participant[];
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void | Promise<void>;
  onVoidSettlementPayment?: (paymentId: string) => void | Promise<void>;
};

const filters: Array<{ id: MovementFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'expenses', label: 'Gastos' },
  { id: 'payments', label: 'Pagos' },
  { id: 'cycles', label: 'Cierres' },
  { id: 'activity', label: 'Actividad' }
];

export function GroupMovements({
  expenses,
  settlementPayments,
  settlementCycles,
  activityLogs,
  participants,
  onEditExpense,
  onDeleteExpense,
  onVoidSettlementPayment
}: GroupMovementsProps) {
  const [filter, setFilter] = useState<MovementFilter>('all');
  const [query, setQuery] = useState('');
  const [participantFilter, setParticipantFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [detailCycle, setDetailCycle] = useState<SettlementCycle | null>(null);

  const movementGroups = useMemo(() => {
    const items: MovementItem[] = [
      ...expenses.map((expense) => ({ type: 'expense' as const, date: expense.date, sortDate: `${expense.date}T23:59:59`, expense })),
      ...settlementPayments.map((payment) => ({ type: 'payment' as const, date: payment.createdAt, sortDate: payment.createdAt, payment })),
      ...settlementCycles.map((cycle) => ({ type: 'cycle' as const, date: cycle.closedAt, sortDate: cycle.closedAt, cycle })),
      ...activityLogs.map((activity) => ({ type: 'activity' as const, date: activity.createdAt, sortDate: activity.createdAt, activity }))
    ].filter((item) => {
      if (filter === 'expenses') return item.type === 'expense';
      if (filter === 'payments') return item.type === 'payment';
      if (filter === 'cycles') return item.type === 'cycle';
      if (filter === 'activity') return item.type === 'activity';
      return item.type !== 'activity';
    }).filter((item) => matchesParticipant(item, participantFilter))
      .filter((item) => matchesDate(item.date, dateFilter))
      .filter((item) => matchesQuery(item, query));

    const sorted = items.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
    const groups = new Map<string, MovementItem[]>();
    for (const item of sorted) {
      const key = movementDateKey(item.date);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    return Array.from(groups.entries()).map(([date, groupItems]) => ({ date, items: groupItems }));
  }, [activityLogs, dateFilter, expenses, filter, participantFilter, query, settlementCycles, settlementPayments]);

  async function handleDelete(expense: Expense) {
    const confirmed = window.confirm(`Eliminar el gasto "${expense.title}"?`);
    if (!confirmed) return;
    try {
      await onDeleteExpense(expense.id);
      setError(null);
    } catch {
      setError('No se pudo eliminar el gasto.');
    }
  }

  async function handleVoid(paymentId: string) {
    const confirmed = window.confirm('Queres anular este pago registrado?');
    if (!confirmed) return;
    try {
      await onVoidSettlementPayment?.(paymentId);
      setError(null);
    } catch {
      setError('No se pudo anular el pago.');
    }
  }

  function participantName(id: string): string {
    return participants.find((participant) => participant.id === id)?.name ?? 'Participante eliminado';
  }

  function participantAlias(id: string): string | undefined {
    return participants.find((participant) => participant.id === id)?.alias;
  }

  function payerText(expense: Expense): string {
    const payers = expense.payers?.length
      ? expense.payers
      : expense.paidByParticipantId
        ? [{ participantId: expense.paidByParticipantId, amountCents: expense.amountCents }]
        : [];

    if (payers.length === 0) return 'Sin pagador';
    if (payers.length === 1) return `Pago ${participantName(payers[0].participantId)}`;
    return `Pagaron ${payers.map((payer) => `${participantName(payer.participantId)} ${formatARS(payer.amountCents)}`).join(' y ')}`;
  }

  function emptyTitle(): string {
    if (query.trim() || participantFilter !== 'all' || dateFilter !== 'all') return 'No encontramos movimientos con esos filtros.';
    if (filter === 'expenses') return 'Todavia no hay gastos.';
    if (filter === 'payments') return 'Todavia no hay pagos registrados.';
    if (filter === 'cycles') return 'Todavia no hay cierres.';
    if (filter === 'activity') return 'Todavia no hay actividad registrada.';
    return 'Todavia no hay movimientos.';
  }

  function resetFilters() {
    setQuery('');
    setParticipantFilter('all');
    setDateFilter('all');
  }

  function participantLabel(id: string): string {
    const participant = participants.find((item) => item.id === id);
    if (!participant) return 'Participante';
    return participant.alias ? `${participant.name} (${participant.alias})` : participant.name;
  }

  function matchesParticipant(item: MovementItem, participantId: string): boolean {
    if (participantId === 'all') return true;
    if (item.type === 'expense') return expenseParticipantIds(item.expense).includes(participantId);
    if (item.type === 'payment') return item.payment.fromParticipantId === participantId || item.payment.toParticipantId === participantId;
    if (item.type === 'activity') {
      return item.activity.actorParticipantId === participantId || Object.values(item.activity.metadata).includes(participantId);
    }
    return false;
  }

  function matchesQuery(item: MovementItem, rawQuery: string): boolean {
    const normalized = normalize(rawQuery);
    if (!normalized) return true;
    return normalize(searchText(item)).includes(normalized);
  }

  function searchText(item: MovementItem): string {
    if (item.type === 'expense') {
      const names = expenseParticipantIds(item.expense).map(participantLabel).join(' ');
      return `gasto ${item.expense.title} ${formatARS(item.expense.amountCents)} ${names}`;
    }
    if (item.type === 'payment') {
      return `pago saldar ${participantLabel(item.payment.fromParticipantId)} ${participantLabel(item.payment.toParticipantId)} ${formatARS(item.payment.amountCents)}`;
    }
    if (item.type === 'cycle') return `cierre periodo ${item.cycle.title}`;
    return `actividad ${activityText(item.activity, item.activity.actorName || 'Alguien', participantName)}`;
  }

  return (
    <section className="space-y-4">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="cc-input w-full"
        placeholder="Buscar movimiento"
      />
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex min-w-max gap-2">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${
                filter === item.id
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <select value={participantFilter} onChange={(event) => setParticipantFilter(event.target.value)} className="cc-input">
          <option value="all">Participante: Todos</option>
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.name}
            </option>
          ))}
        </select>
        <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)} className="cc-input">
          <option value="all">Fecha: Todas</option>
          <option value="today">Hoy</option>
          <option value="last7">Ultimos 7 dias</option>
          <option value="month">Este mes</option>
        </select>
      </div>

      {error ? <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {movementGroups.length === 0 ? (
        <div className="space-y-3">
          <EmptyState title={emptyTitle()} />
          {(query.trim() || participantFilter !== 'all' || dateFilter !== 'all') ? (
            <button type="button" onClick={resetFilters} className="cc-button-secondary">
              Limpiar filtros
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          {movementGroups.map((group) => (
            <div key={group.date} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-500">{formatMovementDateGroup(group.date)}</h2>
              <div className="grid gap-2">
                {group.items.map((item) => {
                  if (item.type === 'expense') {
                    return (
                      <ExpenseMovementCard
                        key={`expense-${item.expense.id}`}
                        expense={item.expense}
                        payerText={payerText(item.expense)}
                        onViewDetail={setDetailExpense}
                        onEditExpense={onEditExpense}
                        onDeleteExpense={handleDelete}
                      />
                    );
                  }

                  if (item.type === 'payment') {
                    return (
                      <PaymentMovementCard
                        key={`payment-${item.payment.id}`}
                        payment={item.payment}
                        fromName={participantName(item.payment.fromParticipantId)}
                        toName={participantName(item.payment.toParticipantId)}
                        toAlias={participantAlias(item.payment.toParticipantId)}
                        onVoid={onVoidSettlementPayment ? handleVoid : undefined}
                      />
                    );
                  }

                  if (item.type === 'activity') {
                    return (
                      <ActivityMovementCard
                        key={`activity-${item.activity.id}`}
                        activity={item.activity}
                        participantName={participantName}
                      />
                    );
                  }

                  return (
                    <CycleMovementCard
                      key={`cycle-${item.cycle.id}`}
                      cycle={item.cycle}
                      closedExpenseCount={expenses.filter((expense) => expense.settlementCycleId === item.cycle.id).length}
                      closedPaymentCount={settlementPayments.filter((payment) => payment.settlementCycleId === item.cycle.id).length}
                      onViewDetail={setDetailCycle}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailExpense ? (
        <ExpenseDetailSheet
          expense={detailExpense}
          participants={participants}
          onClose={() => setDetailExpense(null)}
          onEdit={(expense) => {
            setDetailExpense(null);
            onEditExpense(expense);
          }}
          onDelete={(expense) => {
            setDetailExpense(null);
            void handleDelete(expense);
          }}
        />
      ) : null}

      {detailCycle ? (
        <CycleDetailSheet
          cycle={detailCycle}
          expenses={expenses.filter((expense) => expense.settlementCycleId === detailCycle.id)}
          payments={settlementPayments.filter((payment) => payment.settlementCycleId === detailCycle.id)}
          participants={participants}
          onClose={() => setDetailCycle(null)}
        />
      ) : null}
    </section>
  );
}

function ExpenseMovementCard({
  expense,
  payerText,
  onViewDetail,
  onEditExpense,
  onDeleteExpense
}: {
  expense: Expense;
  payerText: string;
  onViewDetail: (expense: Expense) => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expense: Expense) => void;
}) {
  return (
    <article className="cc-card-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{formatDate(expense.date)}</p>
          <h3 className="mt-1 font-semibold text-slate-900">{expense.title}</h3>
        </div>
        <span className="font-semibold text-slate-900">{formatARS(expense.amountCents)}</span>
      </div>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        <p>{payerText}</p>
        <p>{splitModeLabel(expense.splitMode)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onViewDetail(expense)} className="cc-button-ghost">
          Ver detalle
        </button>
        <button type="button" onClick={() => onEditExpense(expense)} className="cc-button-ghost">
          Editar
        </button>
        <button type="button" onClick={() => void onDeleteExpense(expense)} className="cc-button-danger">
          Eliminar
        </button>
      </div>
    </article>
  );
}

function PaymentMovementCard({
  payment,
  fromName,
  toName,
  toAlias,
  onVoid
}: {
  payment: SettlementPayment;
  fromName: string;
  toName: string;
  toAlias?: string;
  onVoid?: (paymentId: string) => void;
}) {
  const isVoided = Boolean(payment.voidedAt);

  return (
    <article className={`cc-card-soft ${isVoided ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleDateString('es-AR')}</p>
          <h3 className="mt-1 font-semibold text-slate-900">
            {fromName} le pago a {toName}
          </h3>
        </div>
        <span className="font-semibold text-slate-900">{formatARS(payment.amountCents)}</span>
      </div>
      {toAlias ? <p className="mt-2 text-sm text-slate-600">Alias de {toName}: {toAlias}</p> : null}
      {isVoided ? (
        <p className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Pago anulado</p>
      ) : onVoid ? (
        <button type="button" onClick={() => onVoid(payment.id)} className="cc-button-danger mt-3">
          Anular
        </button>
      ) : null}
    </article>
  );
}

function ActivityMovementCard({
  activity,
  participantName
}: {
  activity: ActivityLog;
  participantName: (id: string) => string;
}) {
  const actor = activity.actorName || 'Alguien';
  const text = activityText(activity, actor, participantName);

  return (
    <article className="cc-card-soft">
      <p className="text-xs text-slate-500">{new Date(activity.createdAt).toLocaleDateString('es-AR')}</p>
      <h3 className="mt-1 text-sm font-semibold text-slate-900">{text}</h3>
    </article>
  );
}

function activityText(activity: ActivityLog, actor: string, participantName: (id: string) => string): string {
  const title = metadataString(activity.metadata, 'title');
  const amountCents = metadataNumber(activity.metadata, 'amount_cents');

  if (activity.action === 'expense_created') return `${actor} cargo el gasto${title ? ` "${title}"` : ''}${amountCents ? ` por ${formatARS(amountCents)}` : ''}`;
  if (activity.action === 'expense_updated') return `${actor} edito el gasto${title ? ` "${title}"` : ''}`;
  if (activity.action === 'expense_deleted') return `${actor} elimino el gasto${title ? ` "${title}"` : ''}`;
  if (activity.action === 'payment_created') {
    const fromId = metadataString(activity.metadata, 'from_participant_id');
    const toId = metadataString(activity.metadata, 'to_participant_id');
    const amount = amountCents ? ` de ${formatARS(amountCents)}` : '';
    const parties = fromId && toId ? `: ${participantName(fromId)} le pago a ${participantName(toId)}` : '';
    return `${actor} marco como saldada una deuda${amount}${parties}`;
  }
  if (activity.action === 'payment_voided') return `${actor} anulo un pago${amountCents ? ` de ${formatARS(amountCents)}` : ''}`;
  if (activity.action === 'period_closed') return `${actor} cerro un periodo`;
  if (activity.action === 'participant_created') return `${actor} agrego a ${metadataString(activity.metadata, 'name') ?? 'un participante'} como participante`;
  if (activity.action === 'participant_updated') return `${actor} edito un participante`;
  if (activity.action === 'member_revoked') return `${actor} revoco el acceso de un miembro`;
  if (activity.action === 'member_approved') return `${actor} aprobo una solicitud de acceso`;
  if (activity.action === 'member_rejected') return `${actor} rechazo una solicitud de acceso`;
  if (activity.action === 'member_promoted_to_owner') return `${actor} hizo owner a un miembro`;
  if (activity.action === 'member_demoted_to_member') return `${actor} quito el rol de owner a un miembro`;
  if (activity.action === 'invite_regenerated') return `${actor} regenero el link de invitacion`;
  return `${actor} hizo un cambio en el grupo`;
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function metadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function expenseParticipantIds(expense: Expense): string[] {
  return Array.from(
    new Set([
      ...(expense.payers ?? []).map((payer) => payer.participantId),
      ...(expense.splits ?? []).map((split) => split.participantId),
      ...(expense.paidByParticipantId ? [expense.paidByParticipantId] : []),
      ...(expense.splitParticipantIds ?? [])
    ])
  );
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function matchesDate(value: string, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  if (filter === 'today') return sameDay(date, now);
  if (filter === 'last7') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return date >= start;
  }
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function parseDate(value: string): Date | null {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function splitModeLabel(mode: Expense['splitMode']): string {
  if (mode === 'manual') return 'Montos manuales';
  if (mode === 'percentage') return 'Por porcentaje';
  return 'Partes iguales';
}

function payerModeLabel(mode: Expense['payerMode']): string {
  return mode === 'multiple' ? 'Varias personas' : 'Una persona';
}

function CycleMovementCard({
  cycle,
  closedExpenseCount,
  closedPaymentCount,
  onViewDetail
}: {
  cycle: SettlementCycle;
  closedExpenseCount: number;
  closedPaymentCount: number;
  onViewDetail: (cycle: SettlementCycle) => void;
}) {
  return (
    <article className="cc-card-soft">
      <h3 className="font-semibold text-slate-900">{cycle.title}</h3>
      <p className="mt-1 text-sm text-slate-500">
        {new Date(cycle.closedAt).toLocaleDateString('es-AR')}
        {closedExpenseCount > 0 ? ` - ${closedExpenseCount} gastos` : ''}
        {closedPaymentCount > 0 ? ` - ${closedPaymentCount} pagos` : ''}
      </p>
      <button type="button" onClick={() => onViewDetail(cycle)} className="cc-button-secondary mt-3">
        Ver detalle
      </button>
    </article>
  );
}

function ExpenseDetailSheet({
  expense,
  participants,
  onClose,
  onEdit,
  onDelete
}: {
  expense: Expense;
  participants: Participant[];
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}) {
  const payers = expense.payers?.length
    ? expense.payers
    : expense.paidByParticipantId
      ? [{ participantId: expense.paidByParticipantId, amountCents: expense.amountCents }]
      : [];
  const equalSplitAmount = Math.round(expense.amountCents / Math.max(1, expense.splitParticipantIds?.length ?? 1));
  const splits: ExpenseSplit[] = expense.splits?.length
    ? expense.splits
    : (expense.splitParticipantIds ?? []).map((participantId) => ({ participantId, amountCents: equalSplitAmount }));
  const participantName = (id: string) => participants.find((participant) => participant.id === id)?.name ?? 'Participante';
  const result = new Map<string, { paid: number; owed: number }>();
  for (const payer of payers) result.set(payer.participantId, { paid: (result.get(payer.participantId)?.paid ?? 0) + payer.amountCents, owed: result.get(payer.participantId)?.owed ?? 0 });
  for (const split of splits) result.set(split.participantId, { paid: result.get(split.participantId)?.paid ?? 0, owed: (result.get(split.participantId)?.owed ?? 0) + split.amountCents });

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{formatDate(expense.date)}</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{expense.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="cc-button-ghost">
            Cerrar
          </button>
        </div>
        <p className="mt-3 text-2xl font-semibold text-slate-950">{formatARS(expense.amountCents)}</p>
        <div className="mt-3 grid gap-1 text-sm text-slate-600">
          <p>Modo de pago: {payerModeLabel(expense.payerMode)}</p>
          <p>Modo de division: {splitModeLabel(expense.splitMode)}</p>
        </div>
        <section className="mt-4 space-y-2">
          <h3 className="font-semibold text-slate-900">Pagadores</h3>
          {payers.map((payer) => (
            <p key={payer.participantId} className="text-sm text-slate-600">
              {participantName(payer.participantId)} pago {formatARS(payer.amountCents)}
            </p>
          ))}
        </section>
        <section className="mt-4 space-y-2">
          <h3 className="font-semibold text-slate-900">Division</h3>
          {splits.map((split) => (
            <p key={split.participantId} className="text-sm text-slate-600">
              {participantName(split.participantId)} - {split.percentage != null ? `${formatPercent(split.percentage)} = ` : ''}{formatARS(split.amountCents)}
            </p>
          ))}
        </section>
        <section className="mt-4 space-y-2">
          <h3 className="font-semibold text-slate-900">Resultado de este gasto</h3>
          {Array.from(result.entries()).map(([participantId, values]) => {
            const balance = values.paid - values.owed;
            return (
              <p key={participantId} className="text-sm text-slate-600">
                {participantName(participantId)} queda {balance >= 0 ? '+' : '-'}{formatARS(Math.abs(balance))}
              </p>
            );
          })}
        </section>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => onEdit(expense)} className="cc-button-primary">
            Editar
          </button>
          <button type="button" onClick={() => onDelete(expense)} className="cc-button-danger">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value) + '%';
}

function CycleDetailSheet({
  cycle,
  expenses,
  payments,
  participants,
  onClose
}: {
  cycle: SettlementCycle;
  expenses: Expense[];
  payments: SettlementPayment[];
  participants: Participant[];
  onClose: () => void;
}) {
  const participantName = (id: string) => participants.find((participant) => participant.id === id)?.name ?? 'Participante';
  const totalExpenses = expenses.reduce((total, expense) => total + expense.amountCents, 0);
  const totalPayments = payments.reduce((total, payment) => total + payment.amountCents, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{new Date(cycle.closedAt).toLocaleDateString('es-AR')}</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{cycle.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="cc-button-ghost">
            Cerrar
          </button>
        </div>
        <section className="mt-4 space-y-2">
          <h3 className="font-semibold text-slate-900">Gastos incluidos</h3>
          {expenses.length === 0 ? <p className="text-sm text-slate-500">Sin gastos incluidos.</p> : null}
          {expenses.map((expense) => (
            <div key={expense.id} className="rounded-md bg-slate-50 p-2 text-sm text-slate-700">
              <p className="font-medium">{expense.title}</p>
              <p>{formatARS(expense.amountCents)} - {formatDate(expense.date)}</p>
            </div>
          ))}
        </section>
        <section className="mt-4 space-y-2">
          <h3 className="font-semibold text-slate-900">Pagos incluidos</h3>
          {payments.length === 0 ? <p className="text-sm text-slate-500">Sin pagos incluidos.</p> : null}
          {payments.map((payment) => (
            <div key={payment.id} className="rounded-md bg-slate-50 p-2 text-sm text-slate-700">
              <p className="font-medium">{participantName(payment.fromParticipantId)} le pago a {participantName(payment.toParticipantId)}</p>
              <p>{formatARS(payment.amountCents)} - {new Date(payment.createdAt).toLocaleDateString('es-AR')}</p>
            </div>
          ))}
        </section>
        <section className="mt-4 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
          <p>Total gastos incluidos: {formatARS(totalExpenses)}</p>
          <p>Total pagos registrados incluidos: {formatARS(totalPayments)}</p>
        </section>
      </div>
    </div>
  );
}
