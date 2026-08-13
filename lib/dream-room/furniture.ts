export type FurnitureType = 'bookshelf' | 'stacking-bin';

export interface TierDef {
  index: number;
  usableWidthCm: number;
  clearanceHeightCm: number;
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
}

export interface PlacedBinItem {
  itemId: string;
  col: number;
  row: number;
}

export type FurnitureDef =
  | { id: string; type: 'bookshelf'; label: string; tiers: TierDef[] }
  | { id: string; type: 'stacking-bin'; label: string; bin: BinDef };

export type FurnitureState =
  | { id: string; type: 'bookshelf'; tiers: TierState[] }
  | { id: string; type: 'stacking-bin'; bin: BinDef; placedItems: PlacedBinItem[] };

// 這兩個常數刻意標注成各自具體的分支型別（不是整個FurnitureDef聯合型別），這樣
// createInitialFurnitureState的多載才能正確依照傳入的是哪一種家具、推導出對應的state型別。
export const BOOKSHELF: Extract<FurnitureDef, { type: 'bookshelf' }> = {
  id: 'bookshelf-1',
  type: 'bookshelf',
  label: '展示層架',
  tiers: [
    { index: 0, usableWidthCm: 50, clearanceHeightCm: 16 },
    { index: 1, usableWidthCm: 60, clearanceHeightCm: 20 },
    { index: 2, usableWidthCm: 55, clearanceHeightCm: 26 },
  ],
};

export const STACKING_BIN: Extract<FurnitureDef, { type: 'stacking-bin' }> = {
  id: 'stacking-bin-1',
  type: 'stacking-bin',
  label: '透明堆疊箱',
  bin: { cols: 4, rows: 3, cellWidthCm: 12, cellHeightCm: 12 },
};

// 房間裡目前有的家具清單，之後要加新家具（洞洞板等）直接加進這個陣列就好。
export const ROOM_FURNITURE: FurnitureDef[] = [BOOKSHELF, STACKING_BIN];

export function createInitialFurnitureState(
  def: Extract<FurnitureDef, { type: 'bookshelf' }>
): Extract<FurnitureState, { type: 'bookshelf' }>;
export function createInitialFurnitureState(
  def: Extract<FurnitureDef, { type: 'stacking-bin' }>
): Extract<FurnitureState, { type: 'stacking-bin' }>;
export function createInitialFurnitureState(def: FurnitureDef): FurnitureState;
export function createInitialFurnitureState(def: FurnitureDef): FurnitureState {
  if (def.type === 'bookshelf') {
    return {
      id: def.id,
      type: 'bookshelf',
      tiers: def.tiers.map((tier) => ({ ...tier, placedItemIds: [] })),
    };
  }
  return {
    id: def.id,
    type: 'stacking-bin',
    bin: def.bin,
    placedItems: [],
  };
}
