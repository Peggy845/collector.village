// 超市系統 v1 的經濟參數（見 PROJECT_PROGRESS.md 已定案項目 32）。
// 跟工廠的 lib/factory/catalog.ts 一樣，這些是固定規則數字，不開放玩家/管理者透過網頁調整，
// 故意不建表。這裡的數字全部是「先抓草案，之後試玩覺得不平衡再調」，不是精算過的數字。

// 買一個新貨架要花多少幣。
export const MARKET_SHELF_COST = 150;

// v1 只有一種通用貨架，容量以「總件數」計算，不分商品種類（見 schema.sql market_shelves.capacity，
// 2026-08-01 修正：原本誤設計成「最多幾種商品」，改成「總共能放幾件」，玩家自由分配要放幾種、
// 各放幾件，只要總數不超過容量——例如容量10可以選擇放4件A+6件B，或5件A+3件B+2件C）。
export const DEFAULT_SHELF_CAPACITY = 10;

// 貨架賣東西的速度：固定每分鐘賣出 1 件，不分商品種類、不分貨架等級（v1 刻意簡化，
// 呼應「便利商店」的意象——不管貨架裡放什麼，貨架本身的「出貨速度」都一樣）。
export const MARKET_SELL_MINUTES_PER_UNIT = 1;

// 工廠倉庫容量：每次升級花多少幣、升級後容量增加多少。
export const WAREHOUSE_UPGRADE_COST = 500;
export const WAREHOUSE_UPGRADE_AMOUNT = 50;

// 貨架 slot 的「還剩幾件／賣了幾件」完全用時間差算出來，不需要背景排程，
// 跟工廠生產批次用 ready_at 判斷是否完成同一個做法（見 PROJECT_PROGRESS.md 第10-1/31/32項）。
// active_from 是上架當下就算好、之後不再變動的時間點（見 app/api/market/list/route.ts）。
import type { MarketShelfSlot } from '@/types/database';

export function computeSlotRemaining(slot: MarketShelfSlot, now: number): number {
  const activeFromMs = new Date(slot.active_from).getTime();
  if (now <= activeFromMs) return slot.quantity;
  const elapsedUnits = Math.floor((now - activeFromMs) / (MARKET_SELL_MINUTES_PER_UNIT * 60 * 1000));
  return Math.max(0, slot.quantity - elapsedUnits);
}

export function computeSlotSoldSoFar(slot: MarketShelfSlot, now: number): number {
  return slot.quantity - computeSlotRemaining(slot, now);
}

// 這個 slot 目前是不是貨架上「正在賣」的那一個（還沒輪到它就代表前面還有東西沒賣完）。
export function isSlotActive(slot: MarketShelfSlot, now: number): boolean {
  return new Date(slot.active_from).getTime() <= now;
}

// 這個 slot 全部賣完（依排程時間推算，不代表玩家已經按過收款）大約還要幾分鐘，尚未輪到則回傳 null。
export function minutesUntilSoldOut(slot: MarketShelfSlot, now: number): number | null {
  if (!isSlotActive(slot, now)) return null;
  const remaining = computeSlotRemaining(slot, now);
  return remaining * MARKET_SELL_MINUTES_PER_UNIT;
}
