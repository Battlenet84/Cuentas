import { describe, expect, it } from 'vitest';
import { buildPercentageSplits } from './percentageSplits';

describe('percentageSplits', () => {
  it('divide 50/50', () => {
    expect(buildPercentageSplits(10000, [
      { participantId: 'flor', percentage: 50 },
      { participantId: 'agus', percentage: 50 }
    ])).toEqual([
      { participantId: 'flor', percentage: 50, amountCents: 5000 },
      { participantId: 'agus', percentage: 50, amountCents: 5000 }
    ]);
  });

  it('divide 60/40', () => {
    const splits = buildPercentageSplits(10000, [
      { participantId: 'flor', percentage: 60 },
      { participantId: 'agus', percentage: 40 }
    ]);

    expect(splits.map((split) => split.amountCents)).toEqual([6000, 4000]);
  });

  it('redondea 33.33/33.33/33.34 sin perder centavos', () => {
    const splits = buildPercentageSplits(10000, [
      { participantId: 'flor', percentage: 33.33 },
      { participantId: 'agus', percentage: 33.33 },
      { participantId: 'tomi', percentage: 33.34 }
    ]);

    expect(splits.reduce((total, split) => total + split.amountCents, 0)).toBe(10000);
    expect(splits.map((split) => split.amountCents)).toEqual([3333, 3333, 3334]);
  });

  it('soporta varios pagadores porque solo define la deuda por split', () => {
    const splits = buildPercentageSplits(50000, [
      { participantId: 'flor', percentage: 25 },
      { participantId: 'agus', percentage: 75 }
    ]);

    expect(splits.reduce((total, split) => total + split.amountCents, 0)).toBe(50000);
    expect(splits).toEqual([
      { participantId: 'flor', percentage: 25, amountCents: 12500 },
      { participantId: 'agus', percentage: 75, amountCents: 37500 }
    ]);
  });
});
