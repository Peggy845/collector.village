export type FurnitureType = 'bookshelf' | 'stacking-bin' | 'pegboard';

export interface TierDef {
  index: number;
  usableWidthCm: number;
  clearanceHeightCm: number;
  usableDepthCm: number; // 層架前後可用深度，決定娃娃的厚度塞不塞得下
}

// 家具「定義」（不可變、純尺寸）跟「狀態」（含目前放了什麼）分開，避免用同一個module-level
// 物件直接被放置邏輯改動，造成HMR/重新渲染時狀態外洩。
export interface TierState extends TierDef {
  placedItemIds: string[]; // 由左到右排列，順序可以拖曳調整
}

// 透明堆疊箱是一個2D網格（跟書櫃的「單一軸向、由左到右排隊」性質不同，兩個軸向都要考慮碰撞），
// 每一格代表固定的cm寬高，物件依真實尺寸換算成占用幾欄幾列，跟書櫃刻意用不同的碰撞模型，
// 才是「真的不一樣的家具」而不是同一套邏輯換個外皮。
export interface BinDef {
  cols: number;
  rows: number;
  cellWidthCm: number;
  cellHeightCm: number;
  depthCm: number; // 箱子整體的前後深度，跟欄列格數無關，是全箱共用的單一深度上限
}

export interface PlacedBinItem {
  itemId: string;
  col: number;
  row: number;
}

// 洞洞板：離散的固定釘點（棋盤式rows x cols），跟書櫃的「連續軸向排隊」、堆疊箱的
// 「連續2D網格、物件依尺寸佔用多格」都不同——每根釘子只是一個點，一根釘子上放一個物件
// （不是靠尺寸換算佔用範圍），物件用「掛」的方式垂掛在釘子下方。這是第三種、真正不同的
// 碰撞模型：離散slot occupancy，不是空間換算。
// 刻意不加深度欄位：東西是掛在牆面上、往外懸空，後面沒有「牆」會被厚度頂到，跟書櫃/堆疊箱
// 那種「東西放進一個有限深度的凹槽」性質不同，深度在這個家具沒有自然的碰撞意義。
export interface PegDef {
  cols: number;
  rows: number;
  pegSpacingCmX: number; // 左右相鄰兩根釘子的間距，決定物件掛上去會不會太寬擠到隔壁
  pegSpacingCmY: number; // 上下相鄰兩排釘子的間距，非最後一排時決定往下垂掛的可用高度
  hangClearanceCmBelowBoard: number; // 最後一排釘子往下到板子底緣，還留了多少垂掛空間
}

export interface PlacedPegItem {
  itemId: string;
  col: number;
  row: number;
}

export type FurnitureDef =
  | { id: string; type: 'bookshelf'; label: string; tiers: TierDef[] }
  | { id: string; type: 'stacking-bin'; label: string; bin: BinDef }
  | { id: string; type: 'pegboard'; label: string; peg: PegDef };

export type FurnitureState =
  | { id: string; type: 'bookshelf'; tiers: TierState[] }
  | { id: string; type: 'stacking-bin'; bin: BinDef; placedItems: PlacedBinItem[] }
  | { id: string; type: 'pegboard'; peg: PegDef; placedItems: PlacedPegItem[] };

// 這兩個常數刻意標注成各自具體的分支型別（不是整個FurnitureDef聯合型別），這樣
// createInitialFurnitureState的多載才能正確依照傳入的是哪一種家具、推導出對應的state型別。
// usableDepthCm、bin.depthCm都還是草案數字，等Peggy量完實體家具深度再校正。
export const BOOKSHELF: Extract<FurnitureDef, { type: 'bookshelf' }> = {
  id: 'bookshelf-1',
  type: 'bookshelf',
  label: '展示層架',
  tiers: [
    { index: 0, usableWidthCm: 50, clearanceHeightCm: 16, usableDepthCm: 15 },
    { index: 1, usableWidthCm: 60, clearanceHeightCm: 20, usableDepthCm: 18 },
    { index: 2, usableWidthCm: 55, clearanceHeightCm: 26, usableDepthCm: 20 },
  ],
};

export const STACKING_BIN: Extract<FurnitureDef, { type: 'stacking-bin' }> = {
  id: 'stacking-bin-1',
  type: 'stacking-bin',
  label: '透明堆疊箱',
  bin: { cols: 4, rows: 3, cellWidthCm: 12, cellHeightCm: 12, depthCm: 15 },
};

export const PEGBOARD: Extract<FurnitureDef, { type: 'pegboard' }> = {
  id: 'pegboard-1',
  type: 'pegboard',
  label: '洞洞板',
  peg: { cols: 5, rows: 3, pegSpacingCmX: 9, pegSpacingCmY: 11, hangClearanceCmBelowBoard: 15 },
};

// 房間裡目前有的家具清單，之後要加新家具直接加進這個陣列就好。
export const ROOM_FURNITURE: FurnitureDef[] = [BOOKSHELF, STACKING_BIN, PEGBOARD];

export function createInitialFurnitureState(
  def: Extract<FurnitureDef, { type: 'bookshelf' }>
): Extract<FurnitureState, { type: 'bookshelf' }>;
export function createInitialFurnitureState(
  def: Extract<FurnitureDef, { type: 'stacking-bin' }>
): Extract<FurnitureState, { type: 'stacking-bin' }>;
export function createInitialFurnitureState(
  def: Extract<FurnitureDef, { type: 'pegboard' }>
): Extract<FurnitureState, { type: 'pegboard' }>;
export function createInitialFurnitureState(def: FurnitureDef): FurnitureState;
export function createInitialFurnitureState(def: FurnitureDef): FurnitureState {
  if (def.type === 'bookshelf') {
    return {
      id: def.id,
      type: 'bookshelf',
      tiers: def.tiers.map((tier) => ({ ...tier, placedItemIds: [] })),
    };
  }
  if (def.type === 'stacking-bin') {
    return {
      id: def.id,
      type: 'stacking-bin',
      bin: def.bin,
      placedItems: [],
    };
  }
  return {
    id: def.id,
    type: 'pegboard',
    peg: def.peg,
    placedItems: [],
  };
}
