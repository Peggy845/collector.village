import { describe, expect, it } from 'vitest';
import { CELL_COUNT, GRID_SIZE, PALETTE, createEmptyGrid, isValidPixelData, paletteColorFor } from './palette';

describe('createEmptyGrid', () => {
  it('回傳長度等於 24×24 的全0陣列', () => {
    const grid = createEmptyGrid();
    expect(grid).toHaveLength(GRID_SIZE * GRID_SIZE);
    expect(grid.every((v) => v === 0)).toBe(true);
  });
});

describe('isValidPixelData', () => {
  it('合法的像素資料回傳 true', () => {
    expect(isValidPixelData(createEmptyGrid())).toBe(true);
  });

  it('長度不對回傳 false', () => {
    expect(isValidPixelData(new Array(10).fill(0))).toBe(false);
  });

  it('包含超出色票範圍的索引回傳 false', () => {
    const grid = createEmptyGrid();
    grid[0] = PALETTE.length; // 剛好超出範圍一個
    expect(isValidPixelData(grid)).toBe(false);
  });

  it('包含負數或小數回傳 false', () => {
    const negative = createEmptyGrid();
    negative[0] = -1;
    expect(isValidPixelData(negative)).toBe(false);

    const fraction = createEmptyGrid();
    fraction[0] = 1.5;
    expect(isValidPixelData(fraction)).toBe(false);
  });

  it('不是陣列時回傳 false', () => {
    expect(isValidPixelData('not an array')).toBe(false);
    expect(isValidPixelData(null)).toBe(false);
    expect(isValidPixelData(undefined)).toBe(false);
  });
});

describe('paletteColorFor', () => {
  it('索引0是透明／橡皮擦', () => {
    expect(paletteColorFor(0).hex).toBeNull();
  });

  it('超出範圍的索引安全地退回索引0，不會噴錯', () => {
    expect(paletteColorFor(999).index).toBe(0);
  });

  it('CELL_COUNT 等於 GRID_SIZE 的平方', () => {
    expect(CELL_COUNT).toBe(GRID_SIZE * GRID_SIZE);
  });
});
