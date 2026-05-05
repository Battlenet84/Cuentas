import type { ExpenseSplit } from '../types';

export function parsePercentageInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function buildPercentageSplits(
  totalCents: number,
  percentages: Array<{ participantId: string; percentage: number }>
): ExpenseSplit[] {
  const positive = percentages.filter((item) => item.percentage > 0);
  if (positive.length === 0) return [];

  const raw = positive.map((item) => ({
    ...item,
    exactCents: (totalCents * item.percentage) / 100
  }));
  const base = raw.map((item) => ({
    participantId: item.participantId,
    percentage: item.percentage,
    amountCents: Math.floor(item.exactCents),
    remainder: item.exactCents - Math.floor(item.exactCents)
  }));
  let remaining = totalCents - base.reduce((total, item) => total + item.amountCents, 0);
  const ordered = [...base].sort((a, b) => b.remainder - a.remainder || a.participantId.localeCompare(b.participantId));

  for (const item of ordered) {
    if (remaining <= 0) break;
    item.amountCents += 1;
    remaining -= 1;
  }

  const byParticipant = new Map(ordered.map((item) => [item.participantId, item.amountCents]));
  return positive.map((item) => ({
    participantId: item.participantId,
    percentage: item.percentage,
    amountCents: byParticipant.get(item.participantId) ?? 0
  }));
}

export function percentageSum(percentages: Record<string, string>): number {
  return Object.values(percentages).reduce((total, value) => total + (parsePercentageInput(value) ?? 0), 0);
}
