import { useMemo, useState } from 'react';
import type { ActivityLog, CurrencyCode, Expense, ExpenseSplit, Participant, SettlementCycle, SettlementPayment } from '../types';
import { formatDate, formatMovementDateGroup, movementDateKey } from '../lib/dates';
import { formatCurrencyAmount, normalizeCurrency, supportedCurrencies } from '../lib/money';
import { EmptyState } from './EmptyState';
import { Badge, ChipButton, Icon, SelectField, SheetHandle } from './ui';
import { ConfirmDialog } from './ConfirmDialog';

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
  const [currencyFilter, setCurrencyFilter] = useState<'all' | CurrencyCode>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [detailCycle, setDetailCycle] = useState<SettlementCycle | null>(null);
  const [pendingDeleteExpense, setPendingDeleteExpense] = useState<Expense | null>(null);
  const [pendingVoidPaymentId, setPendingVoidPaymentId] = useState<string | null>(null);
  const hasSecondaryFilters = participantFilter !== 'all' || currencyFilter !== 'all' || dateFilter !== 'all';
  const hasAnyFilters = query.trim() || filter !== 'all' || hasSecondaryFilters;

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
      .filter((item) => matchesCurrency(item, currencyFilter))
      .filter((item) => matchesDate(item.date, dateFilter))
      .filter((item) => matchesQuery(item, query));

    const sorted = items.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
    const groups = new Map<string, MovementItem[]>();
    for (const item of sorted) {
      const key = movementDateKey(item.date);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    return Array.from(groups.entries()).map(([date, groupItems]) => ({ date, items: groupItems }));
  }, [activityLogs, currencyFilter, dateFilter, expenses, filter, participantFilter, query, settlementCycles, settlementPayments]);

  async function confirmDeleteExpense() {
    if (!pendingDeleteExpense) return;
    try {
      await onDeleteExpense(pendingDeleteExpense.id);
      setPendingDeleteExpense(null);
      if (detailExpense?.id === pendingDeleteExpense.id) setDetailExpense(null);
      setError(null);
    } catch {
      setError('No se pudo eliminar el gasto.');
    }
  }

  async function confirmVoidPayment() {
    if (!pendingVoidPaymentId) return;
    try {
      await onVoidSettlementPayment?.(pendingVoidPaymentId);
      setPendingVoidPaymentId(null);
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
    return `Pagaron ${payers.map((payer) => `${participantName(payer.participantId)} ${formatCurrencyAmount(payer.amountCents, expense.currency)}`).join(' y ')}`;
  }

  function emptyTitle(): string {
    if (query.trim() || participantFilter !== 'all' || currencyFilter !== 'all' || dateFilter !== 'all') return 'No encontramos movimientos con esos filtros.';
    if (filter === 'expenses') return 'Todavia no hay gastos.';
    if (filter === 'payments') return 'Todavia no hay pagos registrados.';
    if (filter === 'cycles') return 'Todavia no hay cierres.';
    if (filter === 'activity') return 'Todavia no hay actividad registrada.';
    return 'Todavia no hay movimientos.';
  }

  function resetFilters() {
    setQuery('');
    setParticipantFilter('all');
    setCurrencyFilter('all');
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

  function matchesCurrency(item: MovementItem, currency: 'all' | CurrencyCode): boolean {
    if (currency === 'all') return true;
    if (item.type === 'expense') return normalizeCurrency(item.expense.currency) === currency;
    if (item.type === 'payment') return normalizeCurrency(item.payment.currency) === currency;
    if (item.type === 'activity') return normalize(String(item.activity.metadata.currency ?? '')).includes(normalize(currency));
    return true;
  }

  function searchText(item: MovementItem): string {
    if (item.type === 'expense') {
      const names = expenseParticipantIds(item.expense).map(participantLabel).join(' ');
      return `gasto ${item.expense.title} ${formatCurrencyAmount(item.expense.amountCents, item.expense.currency)} ${normalizeCurrency(item.expense.currency)} ${names}`;
    }
    if (item.type === 'payment') {
      return `pago saldar ${participantLabel(item.payment.fromParticipantId)} ${participantLabel(item.payment.toParticipantId)} ${formatCurrencyAmount(item.payment.amountCents, item.payment.currency)} ${normalizeCurrency(item.payment.currency)}`;
    }
    if (item.type === 'cycle') return `cierre periodo ${item.cycle.title}`;
    return `actividad ${activityText(item.activity, item.activity.actorName || 'Alguien', participantName)}`;
  }

  return (
    <section className="space-y-4">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Icon name="search" size={16} />
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="cc-input w-full pl-10"
          placeholder="Buscar movimiento"
        />
      </div>
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex min-w-max gap-2">
          {filters.map((item) => (
            <ChipButton key={item.id} active={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}
            </ChipButton>
          ))}
        </div>
      </div>

      <div className="cc-card grid gap-2 p-3 sm:grid-cols-3">
        <SelectField value={participantFilter} onChange={(event) => setParticipantFilter(event.target.value)}>
          <option value="all">Participante: Todos</option>
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.name}
            </option>
          ))}
        </SelectField>
        <SelectField value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value as 'all' | CurrencyCode)}>
          <option value="all">Moneda: Todas</option>
          {supportedCurrencies.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </SelectField>
        <SelectField value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)}>
          <option value="all">Fecha: Todas</option>
          <option value="today">Hoy</option>
          <option value="last7">Ultimos 7 dias</option>
          <option value="month">Este mes</option>
        </SelectField>
        {hasAnyFilters ? (
          <button type="button" onClick={resetFilters} className="cc-button-ghost sm:col-span-3">
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {error ? <p className="cc-banner cc-banner-error">{error}</p> : null}

      {movementGroups.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={hasAnyFilters ? 'search' : 'receipt'}
            title={emptyTitle()}
            description={hasAnyFilters ? 'Proba con otro termino o saca los filtros.' : 'Cuando cargues gastos o pagos, van a aparecer aca.'}
          />
          {(query.trim() || participantFilter !== 'all' || currencyFilter !== 'all' || dateFilter !== 'all') ? (
            <button type="button" onClick={resetFilters} className="cc-button-secondary">
              Limpiar filtros
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          {movementGroups.map((group) => (
            <div key={group.date} className="space-y-2">
              <h2 className="cc-section-h px-1">{formatMovementDateGroup(group.date)}</h2>
              <div className="grid gap-2 border-l border-slate-200 pl-3">
                {group.items.map((item) => {
                  if (item.type === 'expense') {
                    return (
                      <ExpenseMovementCard
                        key={`expense-${item.expense.id}`}
                        expense={item.expense}
                        payerText={payerText(item.expense)}
                        onViewDetail={setDetailExpense}
                        onEditExpense={onEditExpense}
                        onDeleteExpense={setPendingDeleteExpense}
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
                      onVoid={onVoidSettlementPayment ? setPendingVoidPaymentId : undefined}
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
            setPendingDeleteExpense(expense);
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
      <ConfirmDialog
        isOpen={Boolean(pendingDeleteExpense)}
        title="Eliminar gasto"
        description="Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={confirmDeleteExpense}
        onCancel={() => setPendingDeleteExpense(null)}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingVoidPaymentId)}
        title="Anular pago"
        description="El pago quedara marcado como anulado y dejara de contar en el periodo abierto."
        confirmLabel="Anular pago"
        tone="danger"
        onConfirm={confirmVoidPayment}
        onCancel={() => setPendingVoidPaymentId(null)}
      />
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
    <article className="cc-card relative p-3 before:absolute before:-left-[17px] before:top-6 before:h-2 before:w-2 before:rounded-full before:bg-[var(--cc-primary)]">
      <div className="flex items-center gap-3">
        <span className="cc-icon-tile"><Icon name="receipt" size={16} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{formatDate(expense.date)}</p>
          <h3 className="mt-1 truncate font-semibold text-slate-900">{expense.title}</h3>
        </div>
        <span className="num font-semibold text-slate-900">{formatCurrencyAmount(expense.amountCents, expense.currency)}</span>
      </div>
      <div className="mt-3 space-y-1 pl-12 text-sm text-slate-600">
        <p>{payerText}</p>
        <p>{splitModeLabel(expense.splitMode)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-12">
        <button type="button" onClick={() => onViewDetail(expense)} className="cc-button-secondary min-h-9 px-3 text-xs">
          Ver detalle
        </button>
        <button type="button" onClick={() => onEditExpense(expense)} className="cc-button-ghost min-h-9 px-3 text-xs">
          Editar
        </button>
        <button type="button" onClick={() => void onDeleteExpense(expense)} className="cc-button-danger min-h-9 px-3 text-xs">
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
    <article className={`cc-card relative p-3 before:absolute before:-left-[17px] before:top-6 before:h-2 before:w-2 before:rounded-full before:bg-[var(--cc-positive)] ${isVoided ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="cc-icon-tile bg-[var(--cc-positive-soft)] text-[var(--cc-positive)]"><Icon name="arrow-r" size={16} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleDateString('es-AR')}</p>
          <h3 className="mt-1 font-semibold text-slate-900">
            {fromName} le pago a {toName}
          </h3>
        </div>
        <span className="num font-semibold text-slate-900">{formatCurrencyAmount(payment.amountCents, payment.currency)}</span>
      </div>
      {toAlias ? <p className="mt-2 pl-12 text-sm text-slate-600">Alias de {toName}: {toAlias}</p> : null}
      {isVoided ? (
        <p className="mt-2 pl-12"><Badge tone="danger">Pago anulado</Badge></p>
      ) : onVoid ? (
        <button type="button" onClick={() => onVoid(payment.id)} className="cc-button-danger ml-12 mt-3 min-h-9 px-3 text-xs">
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
    <article className="relative rounded-2xl border border-transparent p-3 before:absolute before:-left-[17px] before:top-6 before:h-2 before:w-2 before:rounded-full before:bg-[var(--cc-line-strong)]">
      <p className="text-xs text-slate-500">{new Date(activity.createdAt).toLocaleDateString('es-AR')}</p>
      <h3 className="mt-1 text-sm font-semibold text-slate-900">{text}</h3>
    </article>
  );
}

function activityText(activity: ActivityLog, actor: string, participantName: (id: string) => string): string {
  const title = metadataString(activity.metadata, 'title');
  const amountCents = metadataNumber(activity.metadata, 'amount_cents');

  const currency = normalizeCurrency(metadataString(activity.metadata, 'currency'));
  if (activity.action === 'expense_created') return `${actor} cargo el gasto${title ? ` "${title}"` : ''}${amountCents ? ` por ${formatCurrencyAmount(amountCents, currency)}` : ''}`;
  if (activity.action === 'expense_updated') return `${actor} edito el gasto${title ? ` "${title}"` : ''}`;
  if (activity.action === 'expense_deleted') return `${actor} elimino el gasto${title ? ` "${title}"` : ''}`;
  if (activity.action === 'payment_created') {
    const fromId = metadataString(activity.metadata, 'from_participant_id');
    const toId = metadataString(activity.metadata, 'to_participant_id');
    const amount = amountCents ? ` de ${formatCurrencyAmount(amountCents, currency)}` : '';
    const parties = fromId && toId ? `: ${participantName(fromId)} le pago a ${participantName(toId)}` : '';
    return `${actor} marco como saldada una deuda${amount}${parties}`;
  }
  if (activity.action === 'payment_voided') return `${actor} anulo un pago${amountCents ? ` de ${formatCurrencyAmount(amountCents, currency)}` : ''}`;
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
    <article className="cc-card relative p-3 before:absolute before:-left-[17px] before:top-6 before:h-2 before:w-2 before:rounded-full before:bg-[var(--cc-info)]">
      <div className="flex items-center gap-3">
        <span className="cc-icon-tile bg-[var(--cc-info-soft)] text-[var(--cc-info)]"><Icon name="lock" size={16} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900">{cycle.title}</h3>
          <p className="mt-1 text-sm text-slate-500">
        {new Date(cycle.closedAt).toLocaleDateString('es-AR')}
        {closedExpenseCount > 0 ? ` - ${closedExpenseCount} gastos` : ''}
        {closedPaymentCount > 0 ? ` - ${closedPaymentCount} pagos` : ''}
          </p>
        </div>
      </div>
      <button type="button" onClick={() => onViewDetail(cycle)} className="cc-button-secondary ml-12 mt-3 min-h-9 px-3 text-xs">
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
      <div className="cc-bottom-sheet sm:max-w-lg">
        <SheetHandle />
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge>Gasto · {formatDate(expense.date)}</Badge>
            <h2 className="serif mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950">{expense.title}</h2>
            <p className="num mt-1 text-4xl font-semibold tracking-[-0.025em] text-slate-950">{formatCurrencyAmount(expense.amountCents, expense.currency)}</p>
            <p className="mt-1 text-sm text-slate-500">{expense.currency} · {splitModeLabel(expense.splitMode)}</p>
          </div>
          <button type="button" onClick={onClose} className="cc-button-secondary min-h-9 w-9 px-0" aria-label="Cerrar">
            <Icon name="x" size={15} />
          </button>
        </div>
        <section className="mt-4 space-y-2">
          <h3 className="cc-section-h">Pago</h3>
          {payers.map((payer) => (
            <div key={payer.participantId} className="cc-row rounded-xl border border-slate-200 bg-white first:border-t">
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{participantName(payer.participantId)}</span>
              <span className="num text-sm font-semibold text-slate-900">{formatCurrencyAmount(payer.amountCents, expense.currency)}</span>
            </div>
          ))}
        </section>
        <section className="mt-4 space-y-2">
          <h3 className="cc-section-h">Division</h3>
          {splits.map((split) => (
            <div key={split.participantId} className="cc-row rounded-xl border border-slate-200 bg-white first:border-t">
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{participantName(split.participantId)}</span>
              <span className="num text-sm font-semibold text-slate-900">{split.percentage != null ? `${formatPercent(split.percentage)} · ` : ''}{formatCurrencyAmount(split.amountCents, expense.currency)}</span>
            </div>
          ))}
        </section>
        <section className="mt-4 space-y-2">
          <h3 className="cc-section-h">Resultado de este gasto</h3>
          {Array.from(result.entries()).map(([participantId, values]) => {
            const balance = values.paid - values.owed;
            return (
              <div key={participantId} className="cc-row rounded-xl border border-slate-200 bg-white first:border-t">
                <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{participantName(participantId)}</span>
                <span className="num text-sm font-semibold text-slate-900">{balance >= 0 ? '+' : '-'}{formatCurrencyAmount(Math.abs(balance), expense.currency)}</span>
              </div>
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
  const stats = buildCycleStats(expenses, payments, participantName);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:p-4">
      <div className="cc-bottom-sheet sm:max-w-lg">
        <SheetHandle />
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge tone="info">Cierre · {new Date(cycle.closedAt).toLocaleDateString('es-AR')}</Badge>
            <h2 className="serif mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950">{cycle.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="cc-button-secondary min-h-9 w-9 px-0" aria-label="Cerrar">
            <Icon name="x" size={15} />
          </button>
        </div>
        <section className="mt-4 space-y-2">
          <h3 className="cc-section-h">Estadisticas del cierre</h3>
          {stats.map((item) => (
            <div key={item.currency} className="cc-card p-4 text-sm text-slate-700">
              <Badge tone="info">{item.currency}</Badge>
              <p className="num mt-2 text-3xl font-semibold tracking-[-0.025em] text-slate-950">{formatCurrencyAmount(item.totalExpenses, item.currency)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-100 p-3"><p className="text-xs text-slate-500">Gastos</p><p className="font-semibold text-slate-950">{item.expenseCount}</p></div>
                <div className="rounded-xl bg-slate-100 p-3"><p className="text-xs text-slate-500">Pagos</p><p className="font-semibold text-slate-950">{item.paymentCount}</p></div>
              </div>
              {item.topPayer ? <p>Quien pago mas: {item.topPayer.name} pago {formatCurrencyAmount(item.topPayer.amountCents, item.currency)}</p> : null}
              {item.topConsumer ? <p>Quien consumio mas: {item.topConsumer.name} consumio {formatCurrencyAmount(item.topConsumer.amountCents, item.currency)}</p> : null}
              {item.highestExpense ? <p>Gasto mas alto: {item.highestExpense.title} - {formatCurrencyAmount(item.highestExpense.amountCents, item.currency)}</p> : null}
            </div>
          ))}
        </section>
        <section className="mt-4 space-y-2">
          <h3 className="cc-section-h">Gastos incluidos</h3>
          {expenses.length === 0 ? <p className="text-sm text-slate-500">Sin gastos incluidos.</p> : null}
          {expenses.map((expense) => (
            <div key={expense.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <p className="font-medium">{expense.title}</p>
        <p>{formatCurrencyAmount(expense.amountCents, expense.currency)} - {formatDate(expense.date)}</p>
            </div>
          ))}
        </section>
        <section className="mt-4 space-y-2">
          <h3 className="cc-section-h">Pagos incluidos</h3>
          {payments.length === 0 ? <p className="text-sm text-slate-500">Sin pagos incluidos.</p> : null}
          {payments.map((payment) => (
            <div key={payment.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <p className="font-medium">{participantName(payment.fromParticipantId)} le pago a {participantName(payment.toParticipantId)}</p>
              <p>{formatCurrencyAmount(payment.amountCents, payment.currency)} - {new Date(payment.createdAt).toLocaleDateString('es-AR')}</p>
            </div>
          ))}
        </section>
        <section className="mt-4 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
          {stats.map((item) => (
            <div key={`summary-${item.currency}`}>
              <p>Total gastos incluidos {item.currency}: {formatCurrencyAmount(item.totalExpenses, item.currency)}</p>
              <p>Total pagos registrados incluidos {item.currency}: {formatCurrencyAmount(item.totalPayments, item.currency)}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function buildCycleStats(
  expenses: Expense[],
  payments: SettlementPayment[],
  participantName: (id: string) => string
): Array<{
  currency: CurrencyCode;
  totalExpenses: number;
  totalPayments: number;
  expenseCount: number;
  paymentCount: number;
  topPayer: { name: string; amountCents: number } | null;
  topConsumer: { name: string; amountCents: number } | null;
  highestExpense: { title: string; amountCents: number } | null;
}> {
  const currencies = supportedCurrencies.filter((currency) =>
    expenses.some((expense) => normalizeCurrency(expense.currency) === currency) ||
    payments.some((payment) => normalizeCurrency(payment.currency) === currency)
  );

  return currencies.map((currency) => {
    const currencyExpenses = expenses.filter((expense) => normalizeCurrency(expense.currency) === currency);
    const currencyPayments = payments.filter((payment) => normalizeCurrency(payment.currency) === currency);
    const paidByParticipant = new Map<string, number>();
    const consumedByParticipant = new Map<string, number>();

    for (const expense of currencyExpenses) {
      const payers = expense.payers?.length
        ? expense.payers
        : expense.paidByParticipantId
          ? [{ participantId: expense.paidByParticipantId, amountCents: expense.amountCents }]
          : [];
      const splits = expense.splits?.length ? expense.splits : [];
      for (const payer of payers) paidByParticipant.set(payer.participantId, (paidByParticipant.get(payer.participantId) ?? 0) + payer.amountCents);
      for (const split of splits) consumedByParticipant.set(split.participantId, (consumedByParticipant.get(split.participantId) ?? 0) + split.amountCents);
    }

    const topPayer = topParticipant(paidByParticipant, participantName);
    const topConsumer = topParticipant(consumedByParticipant, participantName);
    const highestExpense = currencyExpenses.reduce<Expense | null>((highest, expense) => (!highest || expense.amountCents > highest.amountCents ? expense : highest), null);

    return {
      currency,
      totalExpenses: currencyExpenses.reduce((total, expense) => total + expense.amountCents, 0),
      totalPayments: currencyPayments.reduce((total, payment) => total + payment.amountCents, 0),
      expenseCount: currencyExpenses.length,
      paymentCount: currencyPayments.length,
      topPayer,
      topConsumer,
      highestExpense: highestExpense ? { title: highestExpense.title, amountCents: highestExpense.amountCents } : null
    };
  });
}

function topParticipant(values: Map<string, number>, participantName: (id: string) => string): { name: string; amountCents: number } | null {
  let top: { id: string; amountCents: number } | null = null;
  for (const [id, amountCents] of values.entries()) {
    if (!top || amountCents > top.amountCents) top = { id, amountCents };
  }
  return top ? { name: participantName(top.id), amountCents: top.amountCents } : null;
}
