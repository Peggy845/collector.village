import type { RoomItem } from './roomItems';
import type { FurnitureState, TierDef, TierState } from './furniture';

// 房間布置的碰撞/貼合判斷，純函式、不碰React/DOM，比照 lib/market/placement.ts 的做法。
// 核心設計：貼合狀態永遠是「用當下state即時算出來的」，不是放置當下算好存一個flag，
// 這樣渲染永遠反映真實狀態，不會有算過一次沒同步更新的bug。
export const SNUG_WIDTH_MARGIN_CM = 3;
export const SNUG_HEIGHT_MARGIN_CM = 2;
// 視覺擠壓效果的上限，不管實際超出多少都封頂，避免畫面變形太誇張。
export const MAX_SQUASH = 0.25;

export type AxisStatus = 'ok' | 'snug' | 'overflow';
export type FitClass = 'fits-with-room' | 'snug-fit' | 'force-overflow';

export interface FitResult {
  class: FitClass;
  widthStatus: AxisStatus;
  heightStatus: AxisStatus;
  // 0~MAX_SQUASH，只用來驅動視覺擠壓效果（擠扁/疊在鄰居上面），絕不顯示成文字/數字給玩家看。
  widthSquash: number;
  heightSquash: number;
}

function sumWidths(ids: string[], itemsById: Record<string, RoomItem>): number {
  return ids.reduce((sum, id) => sum + (itemsById[id]?.realWidthCm ?? 0), 0);
}

// 給定「這一層架前面已經佔用的寬度」跟候選物件的真實尺寸，算出貼合狀態。
export function computeFit(
  occupiedWidthCmAhead: number,
  tier: TierDef,
  candidate: { realWidthCm: number; realHeightCm: number }
): FitResult {
  const remainingWidth = tier.usableWidthCm - occupiedWidthCmAhead;
  const widthOverflow = candidate.realWidthCm - remainingWidth;
  const heightOverflow = candidate.realHeightCm - tier.clearanceHeightCm;

  let widthStatus: AxisStatus;
  let widthSquash = 0;
  if (widthOverflow > 0) {
    widthStatus = 'overflow';
    widthSquash = Math.min(MAX_SQUASH, widthOverflow / candidate.realWidthCm);
  } else if (remainingWidth - candidate.realWidthCm < SNUG_WIDTH_MARGIN_CM) {
    widthStatus = 'snug';
  } else {
    widthStatus = 'ok';
  }

  let heightStatus: AxisStatus;
  let heightSquash = 0;
  if (heightOverflow > 0) {
    heightStatus = 'overflow';
    heightSquash = Math.min(MAX_SQUASH, heightOverflow / candidate.realHeightCm);
  } else if (tier.clearanceHeightCm - candidate.realHeightCm < SNUG_HEIGHT_MARGIN_CM) {
    heightStatus = 'snug';
  } else {
    heightStatus = 'ok';
  }

  const fitClass: FitClass =
    widthStatus === 'overflow' || heightStatus === 'overflow'
      ? 'force-overflow'
      : widthStatus === 'snug' || heightStatus === 'snug'
        ? 'snug-fit'
        : 'fits-with-room';

  return { class: fitClass, widthStatus, heightStatus, widthSquash, heightSquash };
}

// 拿著一隻還沒放上去的娃娃，預覽放進這一層架的結果（append 在目前已放置項目的最後面）。
export function computeTierFitForCandidate(
  tier: TierState,
  itemsById: Record<string, RoomItem>,
  candidateItemId: string
): FitResult {
  const candidate = itemsById[candidateItemId];
  if (!candidate) return computeFit(0, tier, { realWidthCm: 0, realHeightCm: 0 });
  const occupiedWidthCmAhead = sumWidths(tier.placedItemIds, itemsById);
  return computeFit(occupiedWidthCmAhead, tier, candidate);
}

// 已經放在層架上第 indexInTier 個位置的娃娃，算它目前的貼合狀態（用來驅動渲染時的
// 高亮/擠壓/貼合樣式），只算排在它前面的項目寬度，不是整層。
export function computeFitForPlacedItem(
  tier: TierState,
  itemsById: Record<string, RoomItem>,
  indexInTier: number
): FitResult {
  const itemId = tier.placedItemIds[indexInTier];
  const candidate = itemsById[itemId];
  if (!candidate) return computeFit(0, tier, { realWidthCm: 0, realHeightCm: 0 });
  const occupiedWidthCmAhead = sumWidths(tier.placedItemIds.slice(0, indexInTier), itemsById);
  return computeFit(occupiedWidthCmAhead, tier, candidate);
}

// 狀態轉換：永遠成功（硬塞不擋，只影響視覺），不改動傳入的物件，回傳新的state。
// insertAt省略時append到最後面（維持舊行為）；有給的話插入在該index，且會先把itemId原本在
// 這一層的位置（如果有）拿掉再插入——這讓「同一層架內拖曳換位置」可以直接呼叫這個函式，
// 不用另外呼叫removeItemFromTier分兩步做。
export function placeItemOnTier(state: FurnitureState, tierIndex: number, itemId: string, insertAt?: number): FurnitureState {
  return {
    ...state,
    tiers: state.tiers.map((tier) => {
      if (tier.index !== tierIndex) return tier;
      const withoutItem = tier.placedItemIds.filter((id) => id !== itemId);
      const index = insertAt === undefined ? withoutItem.length : Math.max(0, Math.min(insertAt, withoutItem.length));
      const next = [...withoutItem];
      next.splice(index, 0, itemId);
      return { ...tier, placedItemIds: next };
    }),
  };
}

export function removeItemFromTier(state: FurnitureState, tierIndex: number, itemId: string): FurnitureState {
  return {
    ...state,
    tiers: state.tiers.map((tier) =>
      tier.index === tierIndex
        ? { ...tier, placedItemIds: tier.placedItemIds.filter((id) => id !== itemId) }
        : tier
    ),
  };
}

export function allPlacedItemIds(state: FurnitureState): Set<string> {
  const ids = new Set<string>();
  for (const tier of state.tiers) {
    for (const id of tier.placedItemIds) ids.add(id);
  }
  return ids;
}
