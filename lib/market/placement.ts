import type { Facing } from '@/types/database';

// 超市空間網格的放置規則驗證，純函式、不碰資料庫，比照 lib/factory/catalog.ts 的
// computeQueuedBatchReadyAt 這類「抽出來方便寫單元測試」的做法。
//
// 核心規則（跟 Peggy 討論定案，見 idea/開發日誌.md 2026-08-05）：家具佔恰好1格，朝向只有
// 上/下兩種，展示面（朝向那一格）前方必須淨空，不能被其他家具佔用；左右可以並排緊鄰，不受限制。
export const GRID_SIZE = 30;

export interface FurniturePosition {
  x: number;
  y: number;
  facing: Facing;
}

// 算出這個家具「朝向淨空格」的座標；超出網格邊界視為自動淨空（回傳 null），不擋在邊界上
// （例如貼著最下面一列朝下擺放，展示面朝向網格外，視同面向開放空間，天然合法）。
export function frontCell(pos: Pick<FurniturePosition, 'x' | 'y' | 'facing'>): { x: number; y: number } | null {
  const y = pos.facing === 'up' ? pos.y - 1 : pos.y + 1;
  if (y < 0 || y >= GRID_SIZE) return null;
  return { x: pos.x, y };
}

function sameCell(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

function withinGrid(pos: { x: number; y: number }): boolean {
  return pos.x >= 0 && pos.x < GRID_SIZE && pos.y >= 0 && pos.y < GRID_SIZE;
}

// existing：呼叫端已排除「正在移動的自己」。依序檢查以下規則，回傳第一個違反的原因：
//   1. target 座標必須在網格範圍內
//   2. target 格必須空（不能跟 existing 裡任何一個家具重疊）
//   3. target 格不能是 existing 裡任何一個家具的「朝向淨空格」（不能擋住別人的展示面）
//   4. target 這個新家具自己的「朝向淨空格」不能已經被 existing 裡的家具佔用（超界視為淨空，天然通過）
//
// 兩個家具面對面夾一條走道（A朝下、B朝上，中間那格是雙方共同的淨空格）是合法的——規則3只擋
// 「target格本身是別人的淨空格」，這種情況下 target 格自己沒有被任何家具佔用，兩者的淨空格
// 剛好重疊在同一個空格上，這正是「經典超商動線」的實作方式。
export function validatePlacement(
  existing: FurniturePosition[],
  target: FurniturePosition
): { ok: true } | { ok: false; reason: string } {
  if (!withinGrid(target)) {
    return { ok: false, reason: '座標超出場地範圍' };
  }
  if (existing.some((f) => sameCell(f, target))) {
    return { ok: false, reason: '這個位置已經有家具了' };
  }
  const blockingFront = existing.some((f) => {
    const front = frontCell(f);
    return front !== null && sameCell(front, target);
  });
  if (blockingFront) {
    return { ok: false, reason: '這個位置擋住了旁邊家具的展示面，前方需要淨空' };
  }
  const myFront = frontCell(target);
  if (myFront !== null && existing.some((f) => sameCell(f, myFront))) {
    return { ok: false, reason: '這個朝向的展示面前方被其他家具擋住了' };
  }
  return { ok: true };
}
