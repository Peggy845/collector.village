export type FurnitureType = 'bookshelf'; // 目前只有一種，之後加新家具是additive，不用改結構

export interface TierDef {
  index: number;
  usableWidthCm: number;
  clearanceHeightCm: number;
}

export interface FurnitureDef {
  id: string;
  type: FurnitureType;
  label: string;
  tiers: TierDef[];
}

// 家具「定義」（不可變、純尺寸）跟「狀態」（含目前放了什麼）分開，避免用同一個module-level
// 物件直接被放置邏輯改動，造成HMR/重新渲染時狀態外洩。未來要加「抽屜」第三層zoom，可以在
// TierDef加一個可選的 drawers?: DrawerDef[]，不需要重構現有結構。
export interface TierState extends TierDef {
  placedItemIds: string[]; // 由左到右排列
}

export interface FurnitureState {
  id: string;
  type: FurnitureType;
  tiers: TierState[];
}

export const BOOKSHELF: FurnitureDef = {
  id: 'bookshelf-1',
  type: 'bookshelf',
  label: '展示層架',
  tiers: [
    { index: 0, usableWidthCm: 50, clearanceHeightCm: 16 },
    { index: 1, usableWidthCm: 60, clearanceHeightCm: 20 },
    { index: 2, usableWidthCm: 55, clearanceHeightCm: 26 },
  ],
};

export function createInitialFurnitureState(def: FurnitureDef): FurnitureState {
  return {
    id: def.id,
    type: def.type,
    tiers: def.tiers.map((tier) => ({ ...tier, placedItemIds: [] })),
  };
}
