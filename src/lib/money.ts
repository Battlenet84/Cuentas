import type { CurrencyCode } from '../types';

export const supportedCurrencies: CurrencyCode[] = ['ARS', 'USD', 'EUR', 'BRL', 'UYU', 'CLP'];

export function normalizeCurrency(value?: string | null): CurrencyCode {
  return supportedCurrencies.includes(value as CurrencyCode) ? (value as CurrencyCode) : 'ARS';
}

export function formatARS(amountCents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100);
}

export function formatCurrencyAmount(amountCents: number, currency: CurrencyCode = 'ARS'): string {
  const normalized = normalizeCurrency(currency);
  if (normalized === 'ARS') return formatARS(amountCents);

  const amount = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100);

  return `${normalized} ${amount}`;
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
