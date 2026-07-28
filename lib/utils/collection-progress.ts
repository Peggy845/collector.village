import type { OwnedStatus, Product, UserCollectionEntry } from '@/types/database';

// 封閉集合（單一系列）：分母固定不變，可用百分比。
// 開放集合（角色／全站）：分母持續擴充中，禁止用百分比呈現，只給原始數字——
// 分母浮動時百分比會製造「進度倒退」的錯覺，對玩家是失真且誤導的呈現（見 BUILD_PROMPT.md 5.1）。
// 因此 OpenCollectionProgress 刻意不提供 percentage 欄位。

export interface ClosedCollectionProgress {
  seriesId: number;
  totalProducts: number;
  ownedRealCount: number;
  ownedVirtualCount: number;
  percentage: number;
}

export interface OpenCollectionProgress {
  ownedRealCount: number;
  ownedVirtualCount: number;
  totalKnownCount: number;
}

type ProductForProgress = Pick<Product, 'id' | 'series_id' | 'characters'>;
type EntryForProgress = Pick<UserCollectionEntry, 'product_id' | 'owned_status'>;

function productIdsWithStatus(entries: EntryForProgress[], status: OwnedStatus): Set<number> {
  const ids = new Set<number>();
  for (const entry of entries) {
    if (entry.owned_status === status) ids.add(entry.product_id);
  }
  return ids;
}

export function calculateSeriesProgress(
  products: ProductForProgress[],
  entries: EntryForProgress[]
): Map<number, ClosedCollectionProgress> {
  const realIds = productIdsWithStatus(entries, 'owned_real');
  const virtualIds = productIdsWithStatus(entries, 'owned_virtual');

  const bySeriesId = new Map<number, ClosedCollectionProgress>();

  for (const product of products) {
    if (product.series_id == null) continue;

    const progress = bySeriesId.get(product.series_id) ?? {
      seriesId: product.series_id,
      totalProducts: 0,
      ownedRealCount: 0,
      ownedVirtualCount: 0,
      percentage: 0,
    };

    progress.totalProducts += 1;
    if (realIds.has(product.id)) progress.ownedRealCount += 1;
    if (virtualIds.has(product.id)) progress.ownedVirtualCount += 1;

    bySeriesId.set(product.series_id, progress);
  }

  for (const progress of bySeriesId.values()) {
    progress.percentage =
      progress.totalProducts > 0
        ? Math.round((progress.ownedRealCount / progress.totalProducts) * 100)
        : 0;
  }

  return bySeriesId;
}

export function calculateCharacterProgress(
  products: ProductForProgress[],
  entries: EntryForProgress[]
): Map<string, OpenCollectionProgress> {
  const realIds = productIdsWithStatus(entries, 'owned_real');
  const virtualIds = productIdsWithStatus(entries, 'owned_virtual');

  const byCharacter = new Map<string, OpenCollectionProgress>();

  for (const product of products) {
    for (const character of product.characters ?? []) {
      const progress = byCharacter.get(character) ?? {
        ownedRealCount: 0,
        ownedVirtualCount: 0,
        totalKnownCount: 0,
      };

      progress.totalKnownCount += 1;
      if (realIds.has(product.id)) progress.ownedRealCount += 1;
      if (virtualIds.has(product.id)) progress.ownedVirtualCount += 1;

      byCharacter.set(character, progress);
    }
  }

  return byCharacter;
}

export function calculateSiteWideProgress(
  products: ProductForProgress[],
  entries: EntryForProgress[]
): OpenCollectionProgress {
  const realIds = productIdsWithStatus(entries, 'owned_real');
  const virtualIds = productIdsWithStatus(entries, 'owned_virtual');

  let ownedRealCount = 0;
  let ownedVirtualCount = 0;
  for (const product of products) {
    if (realIds.has(product.id)) ownedRealCount += 1;
    if (virtualIds.has(product.id)) ownedVirtualCount += 1;
  }

  return {
    ownedRealCount,
    ownedVirtualCount,
    totalKnownCount: products.length,
  };
}

export function formatOpenCollectionLabel(
  progress: OpenCollectionProgress,
  unit = '件'
): string {
  return `已收藏 ${progress.ownedRealCount} ${unit}（資料庫目前收錄約 ${progress.totalKnownCount} ${unit}相關商品，持續擴充中）`;
}
