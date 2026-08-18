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
// excludePlacementId用在「拖曳已經在箱子裡的物件」時，不要跟自己算重疊——用placementId
// 而不是itemId來排除自己，這樣同一itemId的第二份放進來時才會正確跟第一份算碰撞，
// 不會因為itemId相同就被無條件放過（那樣兩份同種類娃娃永遠不會被判定重疊）。
export function computeBinFit(
  bin: BinDef,
  existing: PlacedBinItem[],
  itemsById: Record<string, RoomItem>,
  candidateItemId: string,
  col: number,
  row: number,
  excludePlacementId?: string
): BinFitResult {
  const candidate = itemsById[candidateItemId];
  if (!candidate) return { class: 'fits', outOfBounds: false, overlapsCount: 0, depthOverflow: false };
  const span = computeItemSpan(bin, candidate);
  const outOfBounds = col < 0 || row < 0 || col + span.colSpan > bin.cols || row + span.rowSpan > bin.rows;
  const depthOverflow = candidate.realDepthCm > bin.depthCm;

  const overlapsCount = existing.filter((placed) => {
    if (placed.placementId === excludePlacementId) return false;
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
// 渲染時的視覺擠壓效果，不影響能不能放。用placementId（不是itemId）當識別，同一itemId
// 才能在箱子裡、甚至同一個場景的不同家具間，同時存在好幾份互不影響的「無限制擺放」。
// 夾範圍要扣掉物件自己的colSpan/rowSpan，不能只夾錨點本身：物件常常比一格大，如果錨點
// 夾到cols-1/rows-1，物件往右下延伸的範圍還是會超出邊界，變成computeBinFit永遠判定
// outOfBounds、視覺一直被擠壓旋轉，即使畫面上看起來明明放得下。
export function placeItemInBin(
  state: BinState,
  placementId: string,
  itemId: string,
  col: number,
  row: number,
  itemsById: Record<string, RoomItem>
): BinState {
  const item = itemsById[itemId];
  const span = item ? computeItemSpan(state.bin, item) : { colSpan: 1, rowSpan: 1 };
  const maxCol = Math.max(0, state.bin.cols - span.colSpan);
  const maxRow = Math.max(0, state.bin.rows - span.rowSpan);
  const clampedCol = Math.max(0, Math.min(col, maxCol));
  const clampedRow = Math.max(0, Math.min(row, maxRow));
  const withoutItem = state.placedItems.filter((p) => p.placementId !== placementId);
  return { ...state, placedItems: [...withoutItem, { placementId, itemId, col: clampedCol, row: clampedRow }] };
}

export function removeItemFromBin(state: BinState, placementId: string): BinState {
  return { ...state, placedItems: state.placedItems.filter((p) => p.placementId !== placementId) };
}

export function allBinPlacedItemIds(state: BinState): Set<string> {
  return new Set(state.placedItems.map((p) => p.itemId));
}
