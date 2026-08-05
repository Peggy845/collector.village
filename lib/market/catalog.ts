// 超市系統的經濟參數（見 PROJECT_PROGRESS.md 已定案項目 32）。
// 跟工廠的 lib/factory/catalog.ts 一樣，這些是固定規則數字，不開放玩家/管理者透過網頁調整，
// 故意不建表。這裡的數字全部是「先抓草案，之後試玩覺得不平衡再調」，不是精算過的數字。

// v2（2026-08-05，空間網格家具擺放系統）：家具的種類/造價/容量/商品格式過濾器改放在
// lib/market/furniture.ts（FURNITURE_CATALOG），跟工廠機台/格式的既有慣例一致。
// 這裡不再有「貨架數量上限」（原本的 MAX_SHELVES）——v1 平鋪列表時代那個純粹是怕清單無限變長
// 的權宜之計，改成空間網格後，改由 lib/market/placement.ts 的放置規則自然限制，不需要額外訂數字。

// 家具容量：v1 統一沿用同一個數字，不分家具種類差異化（見 lib/market/furniture.ts）。
export const DEFAULT_FURNITURE_CAPACITY = 10;

// 貨架/家具賣東西的速度：固定每分鐘賣出 1 件，不分商品種類、不分家具等級（v1 刻意簡化，
// 呼應「便利商店」的意象——不管家具裡放什麼，家具本身的「出貨速度」都一樣）。
export const MARKET_SELL_MINUTES_PER_UNIT = 1;

// 工廠倉庫容量：每次升級花多少幣、升級後容量增加多少。
export const WAREHOUSE_UPGRADE_COST = 500;
export const WAREHOUSE_UPGRADE_AMOUNT = 50;

// 家具 slot 的「還剩幾件／賣了幾件」完全用時間差算出來，不需要背景排程，
// 跟工廠生產批次用 ready_at 判斷是否完成同一個做法（見 PROJECT_PROGRESS.md 第10-1/31/32項）。
// active_from 是上架當下就算好、之後不再變動的時間點（見 app/api/market/list/route.ts）。
import type { MarketFurnitureSlot } from '@/types/database';

export function computeSlotRemaining(slot: MarketFurnitureSlot, now: number): number {
  const activeFromMs = new Date(slot.active_from).getTime();
  if (now <= activeFromMs) return slot.quantity;
  const elapsedUnits = Math.floor((now - activeFromMs) / (MARKET_SELL_MINUTES_PER_UNIT * 60 * 1000));
  return Math.max(0, slot.quantity - elapsedUnits);
}

export function computeSlotSoldSoFar(slot: MarketFurnitureSlot, now: number): number {
  return slot.quantity - computeSlotRemaining(slot, now);
}

// 這個 slot 目前是不是家具上「正在賣」的那一個（還沒輪到它就代表前面還有東西沒賣完）。
export function isSlotActive(slot: MarketFurnitureSlot, now: number): boolean {
  return new Date(slot.active_from).getTime() <= now;
}

// 這個 slot 全部賣完（依排程時間推算，不代表玩家已經按過收款）大約還要幾分鐘，尚未輪到則回傳 null。
export function minutesUntilSoldOut(slot: MarketFurnitureSlot, now: number): number | null {
  if (!isSlotActive(slot, now)) return null;
  const remaining = computeSlotRemaining(slot, now);
  return remaining * MARKET_SELL_MINUTES_PER_UNIT;
}

// 提早下架時，這個 slot 原本「排定的完整結束時間」跟「現在或它原本開始時間（取較晚者）」之間
// 省下多少毫秒——這段差額要整批補回同家具後面排隊的格子，讓它們提前開始賣
// （見 app/api/market/delist/route.ts，2026-08-01 修正「下架後排隊沒遞補」的 bug）。
// 抽成獨立函式方便寫單元測試，邏輯本身不依賴資料庫。
export function computeTimeSavedOnEarlyDelist(
  slot: Pick<MarketFurnitureSlot, 'active_from' | 'quantity'>,
  now: number
): number {
  const activeFromMs = new Date(slot.active_from).getTime();
  const scheduledFinishMs = activeFromMs + slot.quantity * MARKET_SELL_MINUTES_PER_UNIT * 60 * 1000;
  return Math.max(0, scheduledFinishMs - Math.max(now, activeFromMs));
}
