import { describe, expect, it } from 'vitest';
import {
  allBinPlacedItemIds,
  computeBinFit,
  computeItemSpan,
  placeItemInBin,
  removeItemFromBin,
} from './binPlacement';
import type { BinDef, FurnitureState } from './furniture';
import type { RoomItem } from './roomItems';

const BIN: BinDef = { cols: 4, rows: 3, cellWidthCm: 12, cellHeightCm: 12, depthCm: 15 };
type BinState = Extract<FurnitureState, { type: 'stacking-bin' }>;

function itemsById(items: RoomItem[]): Record<string, RoomItem> {
  return Object.fromEntries(items.map((i) => [i.id, i]));
}

describe('computeItemSpan', () => {
  it('真實尺寸無條件進位換算成佔用幾欄幾列', () => {
    // 寬13cm/欄寬12cm -> 進位成2欄；高10cm/列高12cm -> 1列
    expect(computeItemSpan(BIN, { realWidthCm: 13, realHeightCm: 10 })).toEqual({ colSpan: 2, rowSpan: 1 });
    // 剛好整除也算1
    expect(computeItemSpan(BIN, { realWidthCm: 12, realHeightCm: 12 })).toEqual({ colSpan: 1, rowSpan: 1 });
  });
});

describe('computeBinFit', () => {
  const items = itemsById([
    { id: 'a', image: '', realWidthCm: 10, realHeightCm: 10, realDepthCm: 10 }, // 1x1
    { id: 'b', image: '', realWidthCm: 20, realHeightCm: 10, realDepthCm: 10 }, // 2x1
    { id: 'deep', image: '', realWidthCm: 10, realHeightCm: 10, realDepthCm: 20 }, // 太深，箱子只有15cm深
  ]);

  it('空箱子放物件，範圍內且沒有重疊 -> fits', () => {
    const result = computeBinFit(BIN, [], items, 'a', 0, 0);
    expect(result.class).toBe('fits');
    expect(result.outOfBounds).toBe(false);
    expect(result.overlapsCount).toBe(0);
    expect(result.depthOverflow).toBe(false);
  });

  it('厚度超過箱子整體深度上限 -> force-overflow，depthOverflow為true（跟欄列位置無關）', () => {
    const result = computeBinFit(BIN, [], items, 'deep', 0, 0);
    expect(result.class).toBe('force-overflow');
    expect(result.depthOverflow).toBe(true);
    expect(result.outOfBounds).toBe(false);
  });

  it('超出箱子邊界 -> force-overflow，outOfBounds為true', () => {
    // 4欄的箱子，2欄寬的物件放在col=3會超出(3+2=5 > 4)
    const result = computeBinFit(BIN, [], items, 'b', 3, 0);
    expect(result.class).toBe('force-overflow');
    expect(result.outOfBounds).toBe(true);
  });

  it('跟既有物件的佔用範圍重疊 -> force-overflow，overlapsCount>0', () => {
    const existing = [{ placementId: 'p-a', itemId: 'a', col: 0, row: 0 }]; // a佔用(0,0)
    const result = computeBinFit(BIN, existing, items, 'b', 0, 0); // b(2x1)從(0,0)開始，會跟a重疊
    expect(result.class).toBe('force-overflow');
    expect(result.overlapsCount).toBe(1);
  });

  it('不重疊的位置 -> fits', () => {
    const existing = [{ placementId: 'p-a', itemId: 'a', col: 0, row: 0 }];
    const result = computeBinFit(BIN, existing, items, 'b', 2, 0); // b從(2,0)開始，跟a(0,0 1x1)不重疊
    expect(result.class).toBe('fits');
    expect(result.overlapsCount).toBe(0);
  });

  it('excludePlacementId讓自己不會跟自己算重疊（拖曳已放置物件時用）', () => {
    const existing = [{ placementId: 'p-a', itemId: 'a', col: 0, row: 0 }];
    const result = computeBinFit(BIN, existing, items, 'a', 0, 0, 'p-a');
    expect(result.class).toBe('fits');
    expect(result.overlapsCount).toBe(0);
  });

  it('同一itemId的第二份不會被無條件排除，跟第一份重疊時要正確判定成force-overflow', () => {
    // 兩份都是itemId 'a'，但placementId不同（p-1 vs p-2）——只排除placementId對得上的那一份，
    // 不能因為itemId相同就整批放過，否則同一種類疊兩份在同一格永遠不會被判定重疊。
    const existing = [{ placementId: 'p-1', itemId: 'a', col: 0, row: 0 }];
    const result = computeBinFit(BIN, existing, items, 'a', 0, 0, 'p-2');
    expect(result.class).toBe('force-overflow');
    expect(result.overlapsCount).toBe(1);
  });
});

describe('placeItemInBin / removeItemFromBin', () => {
  const def: BinState = { id: 'bin-1', type: 'stacking-bin', bin: BIN, placedItems: [] };
  // 跟computeBinFit那組同尺寸：a是1x1、b是2x1（20cm寬/12cm欄寬，無條件進位成2欄）。
  const items = itemsById([
    { id: 'a', image: '', realWidthCm: 10, realHeightCm: 10, realDepthCm: 10 },
    { id: 'b', image: '', realWidthCm: 20, realHeightCm: 10, realDepthCm: 10 },
  ]);

  it('放置後座標正確記錄，且座標會被夾在箱子範圍內', () => {
    let state = def;
    state = placeItemInBin(state, 'p-a', 'a', 1, 1, items);
    expect(state.placedItems).toEqual([{ placementId: 'p-a', itemId: 'a', col: 1, row: 1 }]);

    // 超出範圍的座標會被夾住，不會整個消失在畫面外（a是1x1，錨點直接夾到cols-1）
    const overState = placeItemInBin(def, 'p-a', 'a', 99, -5, items);
    expect(overState.placedItems[0]).toEqual({ placementId: 'p-a', itemId: 'a', col: BIN.cols - 1, row: 0 });
  });

  it('夾範圍要扣掉物件自己的colSpan，不能只夾錨點本身', () => {
    // b是2欄寬，4欄的箱子夾住的上限應該是cols-2=2，不是cols-1=3
    // （夾到3的話，3+2=5會超出邊界，變成錨點合法但物件本身還是outOfBounds）
    const overState = placeItemInBin(def, 'p-b', 'b', 99, 0, items);
    expect(overState.placedItems[0]).toEqual({ placementId: 'p-b', itemId: 'b', col: BIN.cols - 2, row: 0 });
    const fit = computeBinFit(BIN, [], items, 'b', overState.placedItems[0].col, 0);
    expect(fit.outOfBounds).toBe(false);
  });

  it('再次對同一個placementId呼叫placeItemInBin會移動它，不會重複出現兩次', () => {
    let state = def;
    state = placeItemInBin(state, 'p-a', 'a', 0, 0, items);
    state = placeItemInBin(state, 'p-a', 'a', 2, 1, items);
    expect(state.placedItems).toEqual([{ placementId: 'p-a', itemId: 'a', col: 2, row: 1 }]);
  });

  it('同一itemId的兩個不同placementId可以同時存在箱子裡，不會互相覆蓋', () => {
    let state = def;
    state = placeItemInBin(state, 'p-1', 'a', 0, 0, items);
    state = placeItemInBin(state, 'p-2', 'a', 2, 1, items);
    expect(state.placedItems).toEqual([
      { placementId: 'p-1', itemId: 'a', col: 0, row: 0 },
      { placementId: 'p-2', itemId: 'a', col: 2, row: 1 },
    ]);
  });

  it('移除已放置的物件；移除不存在的placementId是no-op', () => {
    let state = def;
    state = placeItemInBin(state, 'p-a', 'a', 0, 0, items);
    state = placeItemInBin(state, 'p-b', 'b', 1, 0, items);

    const afterRemove = removeItemFromBin(state, 'p-a');
    expect(afterRemove.placedItems).toEqual([{ placementId: 'p-b', itemId: 'b', col: 1, row: 0 }]);

    const afterNoop = removeItemFromBin(afterRemove, 'does-not-exist');
    expect(afterNoop.placedItems).toEqual([{ placementId: 'p-b', itemId: 'b', col: 1, row: 0 }]);
  });

  it('不會mutate傳入的state', () => {
    const original = def;
    placeItemInBin(original, 'p-a', 'a', 0, 0, items);
    expect(original.placedItems).toEqual([]);
  });
});

describe('allBinPlacedItemIds', () => {
  it('回傳所有已放置物件的id集合，不重複', () => {
    const def: BinState = { id: 'bin-1', type: 'stacking-bin', bin: BIN, placedItems: [] };
    const items = itemsById([
      { id: 'a', image: '', realWidthCm: 10, realHeightCm: 10, realDepthCm: 10 },
      { id: 'b', image: '', realWidthCm: 20, realHeightCm: 10, realDepthCm: 10 },
    ]);
    let state = def;
    state = placeItemInBin(state, 'p-a', 'a', 0, 0, items);
    state = placeItemInBin(state, 'p-b', 'b', 1, 0, items);
    expect(allBinPlacedItemIds(state)).toEqual(new Set(['a', 'b']));
  });
});
