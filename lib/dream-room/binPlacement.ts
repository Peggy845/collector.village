import type { RoomItem } from './roomItems';
import type { BinDef, FurnitureState, PlacedBinItem } from './furniture';

// 透明堆疊箱的碰撞邏輯：2D網格（欄x列），跟書櫃的「單一軸向、由左到右排隊」刻意不同——
// 這裡兩個軸向都要考慮碰撞，一個物件可能因為左右有東西擋住、也可能因為上下有東西擋住而放不下，
// 不像書櫃永遠只有「這一層架的寬度夠不夠」單一個維度。純函式、不碰React/DOM，比照
// lib/dream-room/placement.ts的寫法。
type BinState = Extract<FurnitureState, { type: 'stacking-bin' }>;

export type BinFitClass = 'fits' | 'force-overflow';

export interface CellSpan {
  colSpan: number;
  rowSpan: number;
}

export interface BinFitResult {
  class: BinFitClass;
  outOfBounds: boolean;
  overlapsCount: number; // 跟幾個既有物件重疊，0代表沒有重疊
  depthOverflow: boolean; // 箱子整體只有單一深度上限，跟欄列格數無關
}

// 物件的真實寬高換算成佔用幾欄幾列（無條件進位，寧可多佔一點也不要低估碰撞範圍）。
export function computeItemSpan(bin: BinDef, item: { realWidthCm: number; realHeightCm: number }): CellSpan {
  return {
    colSpan: Math.max(1, Math.ceil(item.realWidthCm / bin.cellWidthCm)),
    rowSpan: Math.max(1, Math.ceil(item.realHeightCm / bin.cellHeightCm)),
  };
}

function spansOverlap(
  aCol: number,
  aRow: number,
  aColSpan: number,
  aRowSpan: number,
  bCol: number,
  bRow: number,
  bColSpan: number,
  bRowSpan: number
): boolean {
  return aCol < bCol + bColSpan && aCol + aColSpan > bCol && aRow < bRow + bRowSpan && aRow + aRowSpan > bRow;
}

// 候選物件放在(col,row)這個位置（左上角錨點），算出是否超出箱子邊界、跟幾個既有物件重疊。
// excludeItemId用在「拖曳已經在箱子裡的物件」時，不要跟自己算重疊。
export function computeBinFit(
  bin: BinDef,
  existing: PlacedBinItem[],
  itemsById: Record<string, RoomItem>,
  candidateItemId: string,
  col: number,
  row: number,
  excludeItemId?: string
): BinFitResult {
  const candidate = itemsById[candidateItemId];
  if (!candidate) return { class: 'fits', outOfBounds: false, overlapsCount: 0, depthOverflow: false };
  const span = computeItemSpan(bin, candidate);
  const outOfBounds = col < 0 || row < 0 || col + span.colSpan > bin.cols || row + span.rowSpan > bin.rows;
  const depthOverflow = candidate.realDepthCm > bin.depthCm;

  const overlapsCount = existing.filter((placed) => {
    if (placed.itemId === candidateItemId || placed.itemId === excludeItemId) return false;
    const otherItem = itemsById[placed.itemId];
    if (!otherItem) return false;
    const otherSpan = computeItemSpan(bin, otherItem);
    return spansOverlap(col, row, span.colSpan, span.rowSpan, placed.col, placed.row, otherSpan.colSpan, otherSpan.rowSpan);
  }).length;

  const fitClass: BinFitClass = outOfBounds || overlapsCount > 0 || depthOverflow ? 'force-overflow' : 'fits';
  return { class: fitClass, outOfBounds, overlapsCount, depthOverflow };
}

// 狀態轉換：永遠成功（硬塞不擋，只影響視覺），不改動傳入的物件，回傳新的state。
// 座標會夾在箱子範圍內（不會整個消失在畫面外），但允許跟其他物件重疊——重疊與否只影響
// 渲染時的視覺擠壓效果，不影響能不能放。
export function placeItemInBin(state: BinState, itemId: string, col: number, row: number): BinState {
  const clampedCol = Math.max(0, Math.min(col, state.bin.cols - 1));
  const clampedRow = Math.max(0, Math.min(row, state.bin.rows - 1));
  const withoutItem = state.placedItems.filter((p) => p.itemId !== itemId);
  return { ...state, placedItems: [...withoutItem, { itemId, col: clampedCol, row: clampedRow }] };
}

export function removeItemFromBin(state: BinState, itemId: string): BinState {
  return { ...state, placedItems: state.placedItems.filter((p) => p.itemId !== itemId) };
}

export function allBinPlacedItemIds(state: BinState): Set<string> {
  return new Set(state.placedItems.map((p) => p.itemId));
}
