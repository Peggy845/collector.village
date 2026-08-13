import { describe, expect, it } from 'vitest';
import {
  MAX_SQUASH,
  SNUG_WIDTH_MARGIN_CM,
  allPlacedItemIds,
  computeFit,
  computeFitForPlacedItem,
  computeTierFitForCandidate,
  placeItemOnTier,
  removeItemFromTier,
} from './placement';
import { createInitialFurnitureState, type FurnitureDef, type TierDef, type TierState } from './furniture';
import type { RoomItem } from './roomItems';

const TIER: TierDef = { index: 0, usableWidthCm: 50, clearanceHeightCm: 16 };

const FURNITURE_DEF: FurnitureDef = {
  id: 'test-shelf',
  type: 'bookshelf',
  label: '測試層架',
  tiers: [
    { index: 0, usableWidthCm: 50, clearanceHeightCm: 16 },
    { index: 1, usableWidthCm: 30, clearanceHeightCm: 10 },
  ],
};

function itemsById(items: RoomItem[]): Record<string, RoomItem> {
  return Object.fromEntries(items.map((i) => [i.id, i]));
}

describe('computeFit', () => {
  it('空層架放小物件 -> fits-with-room，兩軸squash都是0', () => {
    const result = computeFit(0, TIER, { realWidthCm: 10, realHeightCm: 10 });
    expect(result.class).toBe('fits-with-room');
    expect(result.widthStatus).toBe('ok');
    expect(result.heightStatus).toBe('ok');
    expect(result.widthSquash).toBe(0);
    expect(result.heightSquash).toBe(0);
  });

  it('放完剩餘寬度小於SNUG_WIDTH_MARGIN_CM -> snug-fit', () => {
    // usableWidthCm 50，放寬度48的物件，剩餘2cm < 3cm門檻
    const result = computeFit(0, TIER, { realWidthCm: 48, realHeightCm: 10 });
    expect(result.class).toBe('snug-fit');
    expect(result.widthStatus).toBe('snug');
    expect(48 + SNUG_WIDTH_MARGIN_CM).toBeGreaterThan(TIER.usableWidthCm - 1);
  });

  it('寬度超出可用空間 -> force-overflow，widthSquash > 0且不影響heightStatus', () => {
    const result = computeFit(0, TIER, { realWidthCm: 60, realHeightCm: 10 });
    expect(result.class).toBe('force-overflow');
    expect(result.widthStatus).toBe('overflow');
    expect(result.widthSquash).toBeGreaterThan(0);
    expect(result.heightStatus).toBe('ok');
    expect(result.heightSquash).toBe(0);
  });

  it('高度超出層架淨空 -> force-overflow，heightSquash > 0且不影響widthStatus', () => {
    const result = computeFit(0, TIER, { realWidthCm: 10, realHeightCm: 20 });
    expect(result.class).toBe('force-overflow');
    expect(result.heightStatus).toBe('overflow');
    expect(result.heightSquash).toBeGreaterThan(0);
    expect(result.widthStatus).toBe('ok');
    expect(result.widthSquash).toBe(0);
  });

  it('同時超出兩軸 -> 兩個squash都大於0，但class只有一種force-overflow', () => {
    const result = computeFit(0, TIER, { realWidthCm: 60, realHeightCm: 20 });
    expect(result.class).toBe('force-overflow');
    expect(result.widthSquash).toBeGreaterThan(0);
    expect(result.heightSquash).toBeGreaterThan(0);
  });

  it('嚴重超尺寸時squash會被封頂在MAX_SQUASH，畫面不會變形過誇張', () => {
    const result = computeFit(0, TIER, { realWidthCm: 200, realHeightCm: 100 });
    expect(result.widthSquash).toBe(MAX_SQUASH);
    expect(result.heightSquash).toBe(MAX_SQUASH);
  });
});

describe('computeTierFitForCandidate', () => {
  it('正確累加目前已放置項目的寬度再判斷候選物件', () => {
    const items = itemsById([
      { id: 'a', image: '', realWidthCm: 10, realHeightCm: 5 },
      { id: 'b', image: '', realWidthCm: 15, realHeightCm: 5 },
      { id: 'c', image: '', realWidthCm: 20, realHeightCm: 5 },
    ]);
    const tier: TierState = { ...TIER, placedItemIds: ['a', 'b'] };
    // 已佔用 10+15=25，剩餘 25，放寬度20的c，剩餘25-20=5 >= 3 -> fits-with-room
    const fitsResult = computeTierFitForCandidate(tier, items, 'c');
    expect(fitsResult.class).toBe('fits-with-room');

    const tierAlmostFull: TierState = { ...TIER, placedItemIds: ['a', 'b', 'c'] };
    // 已佔用 10+15+20=45，剩餘5，再放一個寬度4的 -> 剩餘1 < 3 -> snug-fit
    const dItems = { ...items, d: { id: 'd', image: '', realWidthCm: 4, realHeightCm: 5 } };
    const snugResult = computeTierFitForCandidate(tierAlmostFull, dItems, 'd');
    expect(snugResult.class).toBe('snug-fit');
  });
});

describe('computeFitForPlacedItem', () => {
  it('只計算排在它前面的項目寬度，不是整層寬度', () => {
    const items = itemsById([
      { id: 'a', image: '', realWidthCm: 10, realHeightCm: 5 },
      { id: 'b', image: '', realWidthCm: 15, realHeightCm: 5 },
      { id: 'c', image: '', realWidthCm: 20, realHeightCm: 5 },
    ]);
    const tier: TierState = { ...TIER, placedItemIds: ['a', 'b', 'c'] };
    // c排第三個(index 2)，前面只有a+b=25，跟直接呼叫computeTierFitForCandidate('c')(佔用a+b)結果一致
    const result = computeFitForPlacedItem(tier, items, 2);
    expect(result.class).toBe('fits-with-room');

    // a排第一個(index 0)，前面沒有任何東西佔用，不會被b、c的寬度影響
    const resultA = computeFitForPlacedItem(tier, items, 0);
    expect(resultA.class).toBe('fits-with-room');
    expect(resultA.widthStatus).toBe('ok');
  });
});

describe('placeItemOnTier / removeItemFromTier', () => {
  it('放置會依序append到層架尾端，且不會mutate傳入的state', () => {
    const original = createInitialFurnitureState(FURNITURE_DEF);
    const afterA = placeItemOnTier(original, 0, 'a');
    const afterB = placeItemOnTier(afterA, 0, 'b');

    expect(afterB.tiers[0].placedItemIds).toEqual(['a', 'b']);
    // 傳入的state物件本身沒有被改動
    expect(original.tiers[0].placedItemIds).toEqual([]);
    expect(afterA.tiers[0].placedItemIds).toEqual(['a']);
  });

  it('給insertAt時可以插入在指定位置，不是永遠append到最後面', () => {
    let state = createInitialFurnitureState(FURNITURE_DEF);
    state = placeItemOnTier(state, 0, 'a');
    state = placeItemOnTier(state, 0, 'c');
    // 把b插入在a跟c中間（index 1）
    state = placeItemOnTier(state, 0, 'b', 1);

    expect(state.tiers[0].placedItemIds).toEqual(['a', 'b', 'c']);
  });

  it('同一層架內對已放置的項目呼叫placeItemOnTier等於換位置（先移除原本位置再插入新位置）', () => {
    let state = createInitialFurnitureState(FURNITURE_DEF);
    state = placeItemOnTier(state, 0, 'a');
    state = placeItemOnTier(state, 0, 'b');
    state = placeItemOnTier(state, 0, 'c');
    // 把已經在最後面的c移到最前面
    state = placeItemOnTier(state, 0, 'c', 0);

    expect(state.tiers[0].placedItemIds).toEqual(['c', 'a', 'b']);
  });

  it('移除已放置的項目，保留剩餘項目原本的順序', () => {
    let state = createInitialFurnitureState(FURNITURE_DEF);
    state = placeItemOnTier(state, 0, 'a');
    state = placeItemOnTier(state, 0, 'b');
    state = placeItemOnTier(state, 0, 'c');

    const afterRemove = removeItemFromTier(state, 0, 'b');
    expect(afterRemove.tiers[0].placedItemIds).toEqual(['a', 'c']);
  });

  it('移除不存在的id是no-op，內容不變', () => {
    let state = createInitialFurnitureState(FURNITURE_DEF);
    state = placeItemOnTier(state, 0, 'a');

    const afterRemove = removeItemFromTier(state, 0, 'does-not-exist');
    expect(afterRemove.tiers[0].placedItemIds).toEqual(['a']);
  });
});

describe('allPlacedItemIds', () => {
  it('跨層架把所有已放置項目攤平成一個Set，不重複', () => {
    let state = createInitialFurnitureState(FURNITURE_DEF);
    state = placeItemOnTier(state, 0, 'a');
    state = placeItemOnTier(state, 0, 'b');
    state = placeItemOnTier(state, 1, 'c');

    const ids = allPlacedItemIds(state);
    expect(ids).toEqual(new Set(['a', 'b', 'c']));
  });
});
