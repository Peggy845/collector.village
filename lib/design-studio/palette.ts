// 設計坊系統 v1 的畫圖工具規則，寫死在這裡（見 idea/project-brief.md 第四節）。
// 這是版權風險緩解的核心：24×24固定網格＋13色固定色票（含1色透明橡皮擦），
// 不開放自由畫筆或圖片上傳，刻意降低玩家精確畫出可辨識版權角色的能力，故意不建表、
// 不開放玩家或管理者透過網頁調整（跟 lib/factory/catalog.ts 同精神）。

export const GRID_SIZE = 24;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

// 每次「儲存設計」在容量滿了之前的預設上限（實際判斷以 users.design_library_capacity 為準，
// 這裡只當作資料還沒載入完成時的畫面預設值）。
export const DEFAULT_DESIGN_LIBRARY_CAPACITY = 50;

export interface PaletteColor {
  index: number;
  hex: string | null; // null 代表透明／橡皮擦
  name: string;
}

// index 0 固定是透明／橡皮擦，其餘12色是實際顏色，合計13色。
export const PALETTE: PaletteColor[] = [
  { index: 0, hex: null, name: '透明（橡皮擦）' },
  { index: 1, hex: '#1A1A1A', name: '黑' },
  { index: 2, hex: '#FFFFFF', name: '白' },
  { index: 3, hex: '#E53935', name: '紅' },
  { index: 4, hex: '#FB8C00', name: '橘' },
  { index: 5, hex: '#FDD835', name: '黃' },
  { index: 6, hex: '#43A047', name: '綠' },
  { index: 7, hex: '#1E88E5', name: '藍' },
  { index: 8, hex: '#8E24AA', name: '紫' },
  { index: 9, hex: '#EC407A', name: '粉' },
  { index: 10, hex: '#6D4C41', name: '棕' },
  { index: 11, hex: '#9E9E9E', name: '灰' },
  { index: 12, hex: '#26C6DA', name: '青' },
];

export function createEmptyGrid(): number[] {
  return new Array(CELL_COUNT).fill(0);
}

export function isValidPixelData(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== CELL_COUNT) return false;
  return value.every((v) => Number.isInteger(v) && v >= 0 && v < PALETTE.length);
}

export function paletteColorFor(index: number): PaletteColor {
  return PALETTE[index] ?? PALETTE[0];
}
