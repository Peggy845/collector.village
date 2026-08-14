import { describe, expect, it } from 'vitest';
import {
  allPegPlacedItemIds,
  computePegFit,
  placeItemOnPeg,
  removeItemFromPeg,
} from './pegPlacement';
import type { FurnitureState, PegDef } from './furniture';
import type { RoomItem } from './roomItems';

const PEG: PegDef = { cols: 5, rows: 3, pegSpacingCmX: 9, pegSpacingCmY: 11, hangClearanceCmBelowBoard: 15 };
type PegboardState = Extract<FurnitureState, { type: 'pegboard' }>;

function itemsById(items: RoomItem[]): Record<string, RoomItem> {
  return Object.fromEntries(items.map((i) => [i.id, i]));
}

describe('computePegFit', () => {
  const items = itemsById([
    { id: 'a', image: '', realWidthCm: 6, realHeightCm: 9, realDepthCm: 5 }, // 窄+矮，掛哪都沒問題
    { id: 'wide', image: '', realWidthCm: 12, realHeightCm: 9, realDepthCm: 5 }, // 比pegSpacingCmX(9)寬
    { id: 'tall-mid-row', image: '', realWidthCm: 6, realHeightCm: 14, realDepthCm: 5 }, // 比中間排的pegSpacingCmY(11)高，但比最後一排的15矮
  ]);

  it('空板子掛物件，沒超出範圍、沒衝突、寬高沒超配額 -> fits', () => {
    const result = computePegFit(PEG, [], items, 'a', 2, 0);
    expect(result.class).toBe('fits');
    expect(result.outOfBounds).toBe(false);
    expect(result.samePegOccupied).toBe(false);
  });

  it('超出板子範圍(col/row超界) -> force-overflow，outOfBounds為true', () => {
    const result = computePegFit(PEG, [], items, 'a', 5, 0);
    expect(result.class).toBe('force-overflow');
    expect(result.outOfBounds).toBe(true);
  });

  it('同一根釘子已經掛了別的物件 -> force-overflow，samePegOccupied為true', () => {
    const existing = [{ itemId: 'a', col: 1, row: 1 }];
    const result = computePegFit(PEG, existing, items, 'wide', 1, 1);
    expect(result.class).toBe('force-overflow');
    expect(result.samePegOccupied).toBe(true);
  });

  it('excludeItemId讓自己不會跟自己算衝突（拖曳已掛物件時用）', () => {
    const existing = [{ itemId: 'a', col: 1, row: 1 }];
    const result = computePegFit(PEG, existing, items, 'a', 1, 1, 'a');
    expect(result.class).toBe('fits');
    expect(result.samePegOccupied).toBe(false);
  });

  it('物件寬度超過pegSpacingCmX -> force-overflow，widthOverflow為true', () => {
    const result = computePegFit(PEG, [], items, 'wide', 2, 0);
    expect(result.class).toBe('force-overflow');
    expect(result.widthOverflow).toBe(true);
  });

  it('非最後一排：垂掛高度受限於pegSpacingCmY(11)，超過就overflow', () => {
    const result = computePegFit(PEG, [], items, 'tall-mid-row', 2, 0); // row 0，非最後一排(row 2)
    expect(result.class).toBe('force-overflow');
    expect(result.heightOverflow).toBe(true);
  });

  it('最後一排：垂掛高度改用hangClearanceCmBelowBoard(15)，同一件物件在最後一排反而放得下', () => {
    const result = computePegFit(PEG, [], items, 'tall-mid-row', 2, 2); // row 2 是最後一排(rows-1)
    expect(result.class).toBe('fits');
    expect(result.heightOverflow).toBe(false);
  });
});

describe('placeItemOnPeg / removeItemFromPeg', () => {
  const def: PegboardState = { id: 'peg-1', type: 'pegboard', peg: PEG, placedItems: [] };

  it('掛上去後座標正確記錄，且座標會被夾在板子範圍內', () => {
    let state = def;
    state = placeItemOnPeg(state, 'a', 1, 1);
    expect(state.placedItems).toEqual([{ itemId: 'a', col: 1, row: 1 }]);

    const overState = placeItemOnPeg(def, 'b', 99, -5);
    expect(overState.placedItems[0]).toEqual({ itemId: 'b', col: PEG.cols - 1, row: 0 });
  });

  it('再次呼叫placeItemOnPeg會移動同一個物件，不會重複出現兩次', () => {
    let state = def;
    state = placeItemOnPeg(state, 'a', 0, 0);
    state = placeItemOnPeg(state, 'a', 3, 2);
    expect(state.placedItems).toEqual([{ itemId: 'a', col: 3, row: 2 }]);
  });

  it('移除已掛的物件；移除不存在的id是no-op', () => {
    let state = def;
    state = placeItemOnPeg(state, 'a', 0, 0);
    state = placeItemOnPeg(state, 'b', 1, 0);

    const afterRemove = removeItemFromPeg(state, 'a');
    expect(afterRemove.placedItems).toEqual([{ itemId: 'b', col: 1, row: 0 }]);

    const afterNoop = removeItemFromPeg(afterRemove, 'does-not-exist');
    expect(afterNoop.placedItems).toEqual([{ itemId: 'b', col: 1, row: 0 }]);
  });

  it('不會mutate傳入的state', () => {
    const original = def;
    placeItemOnPeg(original, 'a', 0, 0);
    expect(original.placedItems).toEqual([]);
  });
});

describe('allPegPlacedItemIds', () => {
  it('回傳所有已掛物件的id集合，不重複', () => {
    const def: PegboardState = { id: 'peg-1', type: 'pegboard', peg: PEG, placedItems: [] };
    let state = def;
    state = placeItemOnPeg(state, 'a', 0, 0);
    state = placeItemOnPeg(state, 'b', 1, 0);
    expect(allPegPlacedItemIds(state)).toEqual(new Set(['a', 'b']));
  });
});
