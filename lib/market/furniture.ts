import type { FormatKey, FurnitureType } from '@/types/database';

// 超市家具種類的靜態設定，寫死在這裡，跟 lib/factory/catalog.ts 同精神：這是固定的遊戲規則資料，
// 不需要玩家或管理者透過網頁調整，故意不建資料表。
//
// 家具是「商品格式過濾器＋容量」的抽象概念，不是真的視覺容器——遊戲只管「這個家具能放哪些商品格式、
// 還有多少容量」，不管商品在家具內部怎麼排列展示（沿用 market_furniture_slots 的時間序列賣貨機制）。
// 商品格式跟家具種類是多對多關係（例如雷雕機的立牌/吊飾書櫃、洞洞板都能放），不是每台機器唯一
// 對應一種家具（見 idea/開發日誌.md 2026-08-05 討論）。
export interface FurnitureDef {
  type: FurnitureType;
  name: string;
  cost: number;
  allowedFormats: FormatKey[]; // 空陣列＝純裝飾家具，不能放任何商品
  capacity: number | null; // null＝沒有容量概念（純裝飾）
}

// v1 容量統一沿用 DEFAULT_FURNITURE_CAPACITY（見 lib/market/catalog.ts），不分家具種類差異化。
const DEFAULT_FURNITURE_CAPACITY = 10;

export const FURNITURE_CATALOG: FurnitureDef[] = [
  {
    type: 'bookshelf',
    name: '書櫃',
    cost: 150,
    allowedFormats: ['poster', 'postcard', 'card', 'sticker', 'acrylic_stand', 'acrylic_charm'],
    capacity: DEFAULT_FURNITURE_CAPACITY,
  },
  {
    type: 'pegboard',
    name: '洞洞板',
    cost: 150,
    allowedFormats: ['badge', 'keychain', 'acrylic_stand', 'acrylic_charm'],
    capacity: DEFAULT_FURNITURE_CAPACITY,
  },
  {
    type: 'stacking_bin',
    name: '透明堆疊箱',
    cost: 150,
    allowedFormats: ['plush', 'plush_outfit'],
    capacity: DEFAULT_FURNITURE_CAPACITY,
  },
  {
    type: 'cashier',
    name: '收銀機',
    cost: 80,
    allowedFormats: [],
    capacity: null,
  },
];

export function findFurnitureDef(type: string): FurnitureDef | undefined {
  return FURNITURE_CATALOG.find((f) => f.type === type);
}

export function isFormatAllowedForFurniture(furnitureType: string, formatKey: string): boolean {
  const def = findFurnitureDef(furnitureType);
  if (!def) return false;
  return def.allowedFormats.includes(formatKey as FormatKey);
}
