import type { RoomItem } from './roomItems';
import type { PegDef, FurnitureState, PlacedPegItem } from './furniture';

// 洞洞板的碰撞邏輯：離散固定釘點（rows x cols的棋盤格），跟書櫃「單一軸向連續排隊」、
// 堆疊箱「連續2D網格、依尺寸佔用多格」都刻意不同——這裡每根釘子只是一個點，一根釘子上
// 掛一個物件，不是靠尺寸換算佔用範圍。物件的尺寸只用來判斷「掛上去會不會太寬/太長」，
// 不是拿來算佔用幾格。純函式、不碰React/DOM，比照 lib/dream-room/binPlacement.ts 的寫法。
type PegboardState = Extract<FurnitureState, { type: 'pegboard' }>;

export type PegFitClass = 'fits' | 'force-overflow';

export interface PegFitResult {
  class: PegFitClass;
  outOfBounds: boolean;
  samePegOccupied: boolean;
  widthOverflow: boolean;
  heightOverflow: boolean;
}

// 這根釘子往下垂掛的可用高度：不是最後一排的話，垂到下一排釘子為止；
// 最後一排的話，垂到板子最下緣為止（hangClearanceCmBelowBoard）。
function verticalClearanceCm(peg: PegDef, row: number): number {
  return row >= peg.rows - 1 ? peg.hangClearanceCmBelowBoard : peg.pegSpacingCmY;
}

// 候選物件掛在(col,row)這根釘子上，算出是否超出板子範圍、是否跟同一根釘子上既有物件衝突、
// 寬高是否超出這根釘子的可用配額。excludeItemId用在「拖曳已經掛著的物件」時，不要跟自己算衝突。
export function computePegFit(
  peg: PegDef,
  existing: PlacedPegItem[],
  itemsById: Record<string, RoomItem>,
  candidateItemId: string,
  col: number,
  row: number,
  excludeItemId?: string
): PegFitResult {
  const candidate = itemsById[candidateItemId];
  if (!candidate) {
    return { class: 'fits', outOfBounds: false, samePegOccupied: false, widthOverflow: false, heightOverflow: false };
  }

  const outOfBounds = col < 0 || row < 0 || col >= peg.cols || row >= peg.rows;
  const clampedRow = Math.max(0, Math.min(row, peg.rows - 1));

  const samePegOccupied = existing.some(
    (placed) =>
      placed.itemId !== candidateItemId &&
      placed.itemId !== excludeItemId &&
      placed.col === col &&
      placed.row === row
  );

  const widthOverflow = candidate.realWidthCm > peg.pegSpacingCmX;
  const heightOverflow = candidate.realHeightCm > verticalClearanceCm(peg, clampedRow);

  const fitClass: PegFitClass =
    outOfBounds || samePegOccupied || widthOverflow || heightOverflow ? 'force-overflow' : 'fits';

  return { class: fitClass, outOfBounds, samePegOccupied, widthOverflow, heightOverflow };
}

// 狀態轉換：永遠成功（硬塞不擋，只影響視覺），不改動傳入的物件，回傳新的state。
// 座標會夾在板子範圍內，允許跟其他物件掛在同一根釘子上——衝突與否只影響渲染時的
// 視覺擠壓效果，不影響能不能掛。
export function placeItemOnPeg(state: PegboardState, itemId: string, col: number, row: number): PegboardState {
  const clampedCol = Math.max(0, Math.min(col, state.peg.cols - 1));
  const clampedRow = Math.max(0, Math.min(row, state.peg.rows - 1));
  const withoutItem = state.placedItems.filter((p) => p.itemId !== itemId);
  return { ...state, placedItems: [...withoutItem, { itemId, col: clampedCol, row: clampedRow }] };
}

export function removeItemFromPeg(state: PegboardState, itemId: string): PegboardState {
  return { ...state, placedItems: state.placedItems.filter((p) => p.itemId !== itemId) };
}

export function allPegPlacedItemIds(state: PegboardState): Set<string> {
  return new Set(state.placedItems.map((p) => p.itemId));
}
