import { describe, expect, it } from 'vitest';
import { findFurnitureDef, FURNITURE_CATALOG, isFormatAllowedForFurniture } from './furniture';

describe('findFurnitureDef', () => {
  it('找得到已定義的家具種類', () => {
    expect(findFurnitureDef('bookshelf')?.name).toBe('書櫃');
  });

  it('找不到不存在的種類時回傳 undefined', () => {
    expect(findFurnitureDef('not-a-real-type')).toBeUndefined();
  });
});

describe('isFormatAllowedForFurniture', () => {
  it('書櫃能放印表機系列格式跟雷雕機的立牌/吊飾', () => {
    expect(isFormatAllowedForFurniture('bookshelf', 'poster')).toBe(true);
    expect(isFormatAllowedForFurniture('bookshelf', 'postcard')).toBe(true);
    expect(isFormatAllowedForFurniture('bookshelf', 'acrylic_stand')).toBe(true);
    expect(isFormatAllowedForFurniture('bookshelf', 'acrylic_charm')).toBe(true);
  });

  it('書櫃不能放裁縫機/壓模機的東西', () => {
    expect(isFormatAllowedForFurniture('bookshelf', 'plush')).toBe(false);
    expect(isFormatAllowedForFurniture('bookshelf', 'badge')).toBe(false);
  });

  it('洞洞板能放壓模機系列格式跟雷雕機的立牌/吊飾', () => {
    expect(isFormatAllowedForFurniture('pegboard', 'badge')).toBe(true);
    expect(isFormatAllowedForFurniture('pegboard', 'keychain')).toBe(true);
    expect(isFormatAllowedForFurniture('pegboard', 'acrylic_stand')).toBe(true);
    expect(isFormatAllowedForFurniture('pegboard', 'acrylic_charm')).toBe(true);
  });

  it('透明堆疊箱只能放裁縫機系列格式', () => {
    expect(isFormatAllowedForFurniture('stacking_bin', 'plush')).toBe(true);
    expect(isFormatAllowedForFurniture('stacking_bin', 'plush_outfit')).toBe(true);
    expect(isFormatAllowedForFurniture('stacking_bin', 'badge')).toBe(false);
  });

  it('收銀機是純裝飾，allowedFormats 是空陣列、capacity 是 null，不能放任何商品格式', () => {
    const cashier = FURNITURE_CATALOG.find((f) => f.type === 'cashier')!;
    expect(cashier.allowedFormats).toEqual([]);
    expect(cashier.capacity).toBeNull();
    expect(isFormatAllowedForFurniture('cashier', 'poster')).toBe(false);
  });

  it('家具種類不存在時回傳 false', () => {
    expect(isFormatAllowedForFurniture('not-a-real-type', 'poster')).toBe(false);
  });
});
