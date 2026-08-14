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
    const existing = [{ itemId: 'a', col: 0, row: 0 }]; // a佔用(0,0)
    const result = computeBinFit(BIN, existing, items, 'b', 0, 0); // b(2x1)從(0,0)開始，會跟a重疊
    expect(result.class).toBe('force-overflow');
    expect(result.overlapsCount).toBe(1);
  });

  it('不重疊的位置 -> fits', () => {
    const existing = [{ itemId: 'a', col: 0, row: 0 }];
    const result = computeBinFit(BIN, existing, items, 'b', 2, 0); // b從(2,0)開始，跟a(0,0 1x1)不重疊
    expect(result.class).toBe('fits');
    expect(result.overlapsCount).toBe(0);
  });

  it('excludeItemId讓自己不會跟自己算重疊（拖曳已放置物件時用）', () => {
    const existing = [{ itemId: 'a', col: 0, row: 0 }];
    const result = computeBinFit(BIN, existing, items, 'a', 0, 0, 'a');
    expect(result.class).toBe('fits');
    expect(result.overlapsCount).toBe(0);
  });
});

describe('placeItemInBin / removeItemFromBin', () => {
  const def: BinState = { id: 'bin-1', type: 'stacking-bin', bin: BIN, placedItems: [] };

  it('放置後座標正確記錄，且座標會被夾在箱子範圍內', () => {
    let state = def;
    state = placeItemInBin(state, 'a', 1, 1);
    expect(state.placedItems).toEqual([{ itemId: 'a', col: 1, row: 1 }]);

    // 超出範圍的座標會被夾住，不會整個消失在畫面外
    const overState = placeItemInBin(def, 'b', 99, -5);
    expect(overState.placedItems[0]).toEqual({ itemId: 'b', col: BIN.cols - 1, row: 0 });
  });

  it('再次呼叫placeItemInBin會移動同一個物件，不會重複出現兩次', () => {
    let state = def;
    state = placeItemInBin(state, 'a', 0, 0);
    state = placeItemInBin(state, 'a', 2, 1);
    expect(state.placedItems).toEqual([{ itemId: 'a', col: 2, row: 1 }]);
  });

  it('移除已放置的物件；移除不存在的id是no-op', () => {
    let state = def;
    state = placeItemInBin(state, 'a', 0, 0);
    state = placeItemInBin(state, 'b', 1, 0);

    const afterRemove = removeItemFromBin(state, 'a');
    expect(afterRemove.placedItems).toEqual([{ itemId: 'b', col: 1, row: 0 }]);

    const afterNoop = removeItemFromBin(afterRemove, 'does-not-exist');
    expect(afterNoop.placedItems).toEqual([{ itemId: 'b', col: 1, row: 0 }]);
  });

  it('不會mutate傳入的state', () => {
    const original = def;
    placeItemInBin(original, 'a', 0, 0);
    expect(original.placedItems).toEqual([]);
  });
});

describe('allBinPlacedItemIds', () => {
  it('回傳所有已放置物件的id集合，不重複', () => {
    const def: BinState = { id: 'bin-1', type: 'stacking-bin', bin: BIN, placedItems: [] };
    let state = def;
    state = placeItemInBin(state, 'a', 0, 0);
    state = placeItemInBin(state, 'b', 1, 0);
    expect(allBinPlacedItemIds(state)).toEqual(new Set(['a', 'b']));
  });
});
