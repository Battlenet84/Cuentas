export function formatARS(amountCents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100);
}

export function parseARSInput(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  if (!normalized) return null;

  const numberValue = Number(normalized);
  if (!Number.isFinite(numberValue)) return null;

  return Math.round(numberValue * 100);
}
