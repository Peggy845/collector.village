import type { PlacedTierItem, TierDef, TierState, BinDef } from './furniture';
import type { RoomItem } from './roomItems';

// 房間3D場景（components/dream-room/RoomScene3D.tsx）用到的純幾何/排版計算，抽出來方便
// 寫單元測試——原本都是該元件內的module-level閉包函式，混著THREE.Vector3型別但其實
// 不依賴任何React/three.js執行環境，抽出來後這裡完全不import three。

// 由下往上疊（tiers陣列index愈大排愈下面，跟FurnitureZoom.tsx正視圖上到下順序一致），
// 算好每一層的y起點，家具定義本身不會變動時只需要算一次。
export function computeTierYBase(tiers: TierDef[], gapCm: number): Record<number, number> {
  const orderedBottomUp = [...tiers].sort((a, b) => b.index - a.index);
  let cursor = 0;
  const map: Record<number, number> = {};
  for (const tier of orderedBottomUp) {
    map[tier.index] = cursor;
    cursor += tier.clearanceHeightCm + gapCm;
  }
  return map;
}

export interface BinLayout {
  bin: BinDef;
  width: number;
  height: number;
  centerX: number;
  left: number;
}

// 堆疊箱放在書櫃右邊，兩件家具在同一個房間場景裡、不互相重疊——centerX是書櫃最大寬度的
// 一半，加上場景間距，再加堆疊箱寬度的一半。
export function computeBinLayout(bookshelfMaxWidthCm: number, bin: BinDef, sceneGapCm: number): BinLayout {
  const width = bin.cols * bin.cellWidthCm;
  const height = bin.rows * bin.cellHeightCm;
  const centerX = bookshelfMaxWidthCm / 2 + sceneGapCm + width / 2;
  const left = centerX - width / 2;
  return { bin, width, height, centerX, left };
}

// 世界座標(x,y)落在堆疊箱哪一格：座標系跟2D版BinZoom.tsx一致，row 0在最上面。
export function binCellFromPoint(layout: BinLayout, x: number, y: number): { col: number; row: number } {
  const col = Math.floor((x - layout.left) / layout.bin.cellWidthCm);
  const row = Math.floor((layout.height - y) / layout.bin.cellHeightCm);
  return { col, row };
}

// 錨點是格子(col,row)的左上角，娃娃實際尺寸往右下延伸——跟2D版BinZoom.tsx（left/top用格子
// 左上角、width/height用娃娃實際像素尺寸）同一個錨點規則，也跟computeBinFit的colSpan/
// rowSpan碰撞判定一致。娃娃常常比一格大（例如14x18cm放進12x12cm格），如果誤用「格子正
// 中心」當娃娃中心點，娃娃會偏離自己實際佔用的格子範圍，跟旁邊格子的視覺/碰撞就對不起來。
export function binCellCenterWorld(
  layout: BinLayout,
  col: number,
  row: number,
  item: { realWidthCm: number; realHeightCm: number }
): { x: number; y: number } {
  return {
    x: layout.left + col * layout.bin.cellWidthCm + item.realWidthCm / 2,
    y: layout.height - (row * layout.bin.cellHeightCm + item.realHeightCm / 2),
  };
}

// 給一層架跟排列順序（呼叫端已排除正在拖曳中的那個），算出每個item由左到右累加排隊後的
// 中心x（tier本身以x=0置中，範圍是[-usableWidthCm/2, +usableWidthCm/2]），跟
// TopDownFootprint.tsx的累加邏輯同一個精神，只是這裡輸出世界座標x而不是px。
export function tierItemPositions(
  tier: TierDef,
  items: PlacedTierItem[],
  itemsById: Record<string, RoomItem>
): { placementId: string; itemId: string; centerX: number; widthCm: number }[] {
  let cursor = -tier.usableWidthCm / 2;
  const result: { placementId: string; itemId: string; centerX: number; widthCm: number }[] = [];
  for (const p of items) {
    const item = itemsById[p.itemId];
    if (!item) continue;
    const centerX = cursor + item.realWidthCm / 2;
    result.push({ placementId: p.placementId, itemId: p.itemId, centerX, widthCm: item.realWidthCm });
    cursor += item.realWidthCm;
  }
  return result;
}

// 放開手的水平位置決定插入在哪個順位，讓同一層架內也能拖到左邊/右邊換位置，不會永遠固定
// append到最右邊。用placementId（不是itemId）排除自己：同一itemId可能有好幾份放在畫面上，
// 只有placementId能唯一鎖定「正在被拖的到底是哪一份」。
export function computeInsertIndex(
  tier: TierState,
  dropWorldX: number,
  excludePlacementId: string,
  itemsById: Record<string, RoomItem>
): number {
  const others = tier.placedItems.filter((p) => p.placementId !== excludePlacementId);
  const positions = tierItemPositions(tier, others, itemsById);
  let insertIndex = 0;
  for (const { centerX } of positions) {
    if (dropWorldX > centerX) insertIndex++;
    else break;
  }
  return insertIndex;
}
