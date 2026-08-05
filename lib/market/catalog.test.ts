import { describe, expect, it } from 'vitest';
import {
  computeSlotRemaining,
  computeSlotSoldSoFar,
  computeTimeSavedOnEarlyDelist,
  isSlotActive,
  minutesUntilSoldOut,
} from './catalog';
import type { MarketFurnitureSlot } from '@/types/database';

const MIN = 60 * 1000;

function slot(overrides: Partial<MarketFurnitureSlot> = {}): MarketFurnitureSlot {
  return {
    id: 1,
    furniture_id: 1,
    format_key: 'postcard',
    design_id: 1,
    quantity: 10,
    collected_quantity: 0,
    active_from: new Date(0).toISOString(),
    listed_at: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('computeSlotRemaining', () => {
  it('尚未輪到（now 早於 active_from）時剩全部數量', () => {
    const s = slot({ active_from: new Date(1000).toISOString(), quantity: 10 });
    expect(computeSlotRemaining(s, 0)).toBe(10);
  });

  it('剛好輪到（now === active_from）時還沒賣出任何一件', () => {
    const s = slot({ active_from: new Date(0).toISOString(), quantity: 10 });
    expect(computeSlotRemaining(s, 0)).toBe(10);
  });

  it('每分鐘賣 1 件，照經過分鐘數遞減', () => {
    const s = slot({ active_from: new Date(0).toISOString(), quantity: 10 });
    expect(computeSlotRemaining(s, 3 * MIN)).toBe(7);
  });

  it('賣完後不會變負數', () => {
    const s = slot({ active_from: new Date(0).toISOString(), quantity: 10 });
    expect(computeSlotRemaining(s, 999 * MIN)).toBe(0);
  });

  it('未滿一分鐘不算賣掉一件（無條件捨去）', () => {
    const s = slot({ active_from: new Date(0).toISOString(), quantity: 10 });
    expect(computeSlotRemaining(s, 59 * 1000)).toBe(10);
  });
});

describe('computeSlotSoldSoFar', () => {
  it('等於總量減剩餘量', () => {
    const s = slot({ active_from: new Date(0).toISOString(), quantity: 10 });
    expect(computeSlotSoldSoFar(s, 4 * MIN)).toBe(4);
  });
});

describe('isSlotActive', () => {
  it('now 早於 active_from 時尚未輪到', () => {
    const s = slot({ active_from: new Date(1000).toISOString() });
    expect(isSlotActive(s, 0)).toBe(false);
  });

  it('now 到達 active_from 時算輪到', () => {
    const s = slot({ active_from: new Date(1000).toISOString() });
    expect(isSlotActive(s, 1000)).toBe(true);
  });
});

describe('minutesUntilSoldOut', () => {
  it('尚未輪到時回傳 null', () => {
    const s = slot({ active_from: new Date(MIN).toISOString(), quantity: 5 });
    expect(minutesUntilSoldOut(s, 0)).toBeNull();
  });

  it('輪到之後回傳剩餘件數換算的分鐘數', () => {
    const s = slot({ active_from: new Date(0).toISOString(), quantity: 5 });
    expect(minutesUntilSoldOut(s, 2 * MIN)).toBe(3);
  });
});

describe('computeTimeSavedOnEarlyDelist（下架排隊遞補用）', () => {
  it('東西還沒開始賣就下架，省下整段排定時間', () => {
    // active_from 在未來 5 分鐘，quantity 10 件代表排定會用掉 10 分鐘。
    const s = { active_from: new Date(5 * MIN).toISOString(), quantity: 10 };
    expect(computeTimeSavedOnEarlyDelist(s, 0)).toBe(10 * MIN);
  });

  it('賣到一半下架，只省下還沒賣掉的部分', () => {
    // active_from = 0，quantity 10 件（排定結束於 10 分鐘），now = 4 分鐘時下架。
    const s = { active_from: new Date(0).toISOString(), quantity: 10 };
    expect(computeTimeSavedOnEarlyDelist(s, 4 * MIN)).toBe(6 * MIN);
  });

  it('已經賣完才下架，省下的時間是 0（不會是負數）', () => {
    const s = { active_from: new Date(0).toISOString(), quantity: 10 };
    expect(computeTimeSavedOnEarlyDelist(s, 20 * MIN)).toBe(0);
  });

  it('剛好在排定結束的瞬間下架，省下時間是 0', () => {
    const s = { active_from: new Date(0).toISOString(), quantity: 10 };
    expect(computeTimeSavedOnEarlyDelist(s, 10 * MIN)).toBe(0);
  });
});
