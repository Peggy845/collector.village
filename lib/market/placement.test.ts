import { describe, expect, it } from 'vitest';
import { frontCell, GRID_SIZE, validatePlacement, type FurniturePosition } from './placement';

describe('frontCell', () => {
  it('facing down 時朝向格是 y+1', () => {
    expect(frontCell({ x: 5, y: 5, facing: 'down' })).toEqual({ x: 5, y: 6 });
  });

  it('facing up 時朝向格是 y-1', () => {
    expect(frontCell({ x: 5, y: 5, facing: 'up' })).toEqual({ x: 5, y: 4 });
  });

  it('facing down 貼著最下面一列時，朝向格超出邊界回傳 null（視為自動淨空）', () => {
    expect(frontCell({ x: 5, y: GRID_SIZE - 1, facing: 'down' })).toBeNull();
  });

  it('facing up 貼著最上面一列時，朝向格超出邊界回傳 null', () => {
    expect(frontCell({ x: 5, y: 0, facing: 'up' })).toBeNull();
  });
});

describe('validatePlacement', () => {
  it('空網格上任何合法座標都能放置', () => {
    const result = validatePlacement([], { x: 5, y: 5, facing: 'down' });
    expect(result.ok).toBe(true);
  });

  it('座標超出 0~29 範圍時拒絕', () => {
    expect(validatePlacement([], { x: -1, y: 5, facing: 'down' }).ok).toBe(false);
    expect(validatePlacement([], { x: 5, y: GRID_SIZE, facing: 'down' }).ok).toBe(false);
  });

  it('目標格已經有家具時拒絕', () => {
    const existing: FurniturePosition[] = [{ x: 5, y: 5, facing: 'down' }];
    const result = validatePlacement(existing, { x: 5, y: 5, facing: 'up' });
    expect(result.ok).toBe(false);
  });

  it('目標格是既有家具的朝向淨空格時拒絕（不能擋住別人的展示面）', () => {
    // A 在 (5,5) facing down，展示面朝向 (5,6)。
    const existing: FurniturePosition[] = [{ x: 5, y: 5, facing: 'down' }];
    const result = validatePlacement(existing, { x: 5, y: 6, facing: 'up' });
    expect(result.ok).toBe(false);
  });

  it('自己的朝向淨空格已被既有家具佔用時拒絕', () => {
    // A 在 (5,5)。新家具想放在 (5,6) facing up，展示面朝向 (5,5)，被 A 佔用。
    const existing: FurniturePosition[] = [{ x: 5, y: 5, facing: 'down' }];
    const result = validatePlacement(existing, { x: 5, y: 6, facing: 'up' });
    expect(result.ok).toBe(false);
  });

  it('左右並排緊鄰不受限制', () => {
    const existing: FurniturePosition[] = [{ x: 5, y: 5, facing: 'down' }];
    const result = validatePlacement(existing, { x: 6, y: 5, facing: 'down' });
    expect(result.ok).toBe(true);
  });

  it('邊界列的朝向淨空格出界視為自動淨空，允許放置', () => {
    const existing: FurniturePosition[] = [{ x: 5, y: GRID_SIZE - 1, facing: 'down' }];
    // 另一個家具放在同一列旁邊，朝向也超界，兩者互不影響。
    const result = validatePlacement(existing, { x: 6, y: GRID_SIZE - 1, facing: 'down' });
    expect(result.ok).toBe(true);
  });

  it('兩個家具面對面共用同一格走道時，兩者都合法（經典超商動線）', () => {
    // A 在 (5,5) facing down，展示面朝向 (5,6)。
    // B 在 (5,7) facing up，展示面也朝向 (5,6)。
    // (5,6) 這格本身沒有家具佔用，兩者的淨空格重疊在同一個空格上，合法。
    const existing: FurniturePosition[] = [{ x: 5, y: 5, facing: 'down' }];
    const result = validatePlacement(existing, { x: 5, y: 7, facing: 'up' });
    expect(result.ok).toBe(true);
  });

  it('前後貼著（沒有留一格淨空）時拒絕', () => {
    // A 在 (5,5) facing down，展示面朝向 (5,6)。B 想直接放在 (5,6)，擋住 A 的展示面。
    const existing: FurniturePosition[] = [{ x: 5, y: 5, facing: 'down' }];
    const result = validatePlacement(existing, { x: 5, y: 6, facing: 'down' });
    expect(result.ok).toBe(false);
  });
});
