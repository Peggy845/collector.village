import { describe, expect, it } from 'vitest';
import {
  calculateSeriesProgress,
  calculateCharacterProgress,
  calculateSiteWideProgress,
  formatOpenCollectionLabel,
} from './collection-progress';

describe('calculateSeriesProgress（封閉集合，有百分比）', () => {
  it('沒有series_id的商品不會出現在結果裡（開放集合另外用calculateCharacterProgress處理）', () => {
    const products = [{ id: 1, series_id: null, characters: [] }];
    const result = calculateSeriesProgress(products, []);
    expect(result.size).toBe(0);
  });

  it('依series_id分組，totalProducts正確累計，不同系列互不影響', () => {
    const products = [
      { id: 1, series_id: 10, characters: [] },
      { id: 2, series_id: 10, characters: [] },
      { id: 3, series_id: 20, characters: [] },
    ];
    const result = calculateSeriesProgress(products, []);
    expect(result.get(10)?.totalProducts).toBe(2);
    expect(result.get(20)?.totalProducts).toBe(1);
  });

  it('只有owned_real/owned_virtual會計入擁有數，其他狀態（例如wanted）不算', () => {
    const products = [
      { id: 1, series_id: 10, characters: [] },
      { id: 2, series_id: 10, characters: [] },
      { id: 3, series_id: 10, characters: [] },
    ];
    const entries = [
      { product_id: 1, owned_status: 'owned_real' as const },
      { product_id: 2, owned_status: 'owned_virtual' as const },
      { product_id: 3, owned_status: 'wanted' as const },
    ];
    const result = calculateSeriesProgress(products, entries);
    const progress = result.get(10)!;
    expect(progress.ownedRealCount).toBe(1);
    expect(progress.ownedVirtualCount).toBe(1);
  });

  it('percentage只算owned_real（不含虛擬持有），四捨五入到整數', () => {
    const products = [
      { id: 1, series_id: 10, characters: [] },
      { id: 2, series_id: 10, characters: [] },
      { id: 3, series_id: 10, characters: [] },
    ];
    const entries = [{ product_id: 1, owned_status: 'owned_real' as const }];
    const result = calculateSeriesProgress(products, entries);
    expect(result.get(10)?.percentage).toBe(33); // 1/3 = 33.3...% -> 33
  });

  it('同一商品同一狀態出現兩筆entry不會重複計數（內部用Set去重）', () => {
    const products = [{ id: 1, series_id: 10, characters: [] }];
    const entries = [
      { product_id: 1, owned_status: 'owned_real' as const },
      { product_id: 1, owned_status: 'owned_real' as const },
    ];
    const result = calculateSeriesProgress(products, entries);
    expect(result.get(10)?.ownedRealCount).toBe(1);
  });
});

describe('calculateCharacterProgress（開放集合，故意不給百分比）', () => {
  it('商品沒有characters時不會被算進任何角色', () => {
    const products = [{ id: 1, series_id: 10, characters: [] }];
    const result = calculateCharacterProgress(products, []);
    expect(result.size).toBe(0);
  });

  it('商品掛多個角色時，每個角色的totalKnownCount都各自+1（不是均分）', () => {
    const products = [{ id: 1, series_id: 10, characters: ['艾連', '米卡莎'] }];
    const result = calculateCharacterProgress(products, []);
    expect(result.get('艾連')?.totalKnownCount).toBe(1);
    expect(result.get('米卡莎')?.totalKnownCount).toBe(1);
  });

  it('擁有數依角色正確累計，跨商品同一角色會加總', () => {
    const products = [
      { id: 1, series_id: 10, characters: ['艾連'] },
      { id: 2, series_id: 10, characters: ['艾連'] },
    ];
    const entries = [{ product_id: 1, owned_status: 'owned_real' as const }];
    const result = calculateCharacterProgress(products, entries);
    expect(result.get('艾連')).toEqual({ ownedRealCount: 1, ownedVirtualCount: 0, totalKnownCount: 2 });
  });

  it('回傳結構沒有percentage欄位（開放集合刻意不提供）', () => {
    const products = [{ id: 1, series_id: 10, characters: ['艾連'] }];
    const result = calculateCharacterProgress(products, []);
    expect(Object.keys(result.get('艾連')!).sort()).toEqual(['ownedRealCount', 'ownedVirtualCount', 'totalKnownCount']);
  });
});

describe('calculateSiteWideProgress（全站開放集合）', () => {
  it('totalKnownCount就是商品總數，不受擁有狀態影響', () => {
    const products = [
      { id: 1, series_id: 10, characters: [] },
      { id: 2, series_id: null, characters: [] },
    ];
    const result = calculateSiteWideProgress(products, []);
    expect(result.totalKnownCount).toBe(2);
  });

  it('正確加總全站的owned_real/owned_virtual數量', () => {
    const products = [
      { id: 1, series_id: 10, characters: [] },
      { id: 2, series_id: 10, characters: [] },
      { id: 3, series_id: 10, characters: [] },
    ];
    const entries = [
      { product_id: 1, owned_status: 'owned_real' as const },
      { product_id: 2, owned_status: 'owned_real' as const },
      { product_id: 3, owned_status: 'owned_virtual' as const },
    ];
    const result = calculateSiteWideProgress(products, entries);
    expect(result).toEqual({ ownedRealCount: 2, ownedVirtualCount: 1, totalKnownCount: 3 });
  });
});

describe('formatOpenCollectionLabel', () => {
  it('預設單位是「件」，帶入實際數字', () => {
    const label = formatOpenCollectionLabel({ ownedRealCount: 5, ownedVirtualCount: 2, totalKnownCount: 40 });
    expect(label).toBe('已收藏 5 件（資料庫目前收錄約 40 件相關商品，持續擴充中）');
  });

  it('可以換成自訂單位（例如「位」給角色進度用）', () => {
    const label = formatOpenCollectionLabel({ ownedRealCount: 3, ownedVirtualCount: 0, totalKnownCount: 10 }, '位');
    expect(label).toBe('已收藏 3 位（資料庫目前收錄約 10 位相關商品，持續擴充中）');
  });
});
