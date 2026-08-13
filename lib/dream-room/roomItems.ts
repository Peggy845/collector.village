export interface RoomItem {
  id: string;
  image: string;
  realWidthCm: number;
  realHeightCm: number;
}

// placeholder真實尺寸，開發者之後會實際量測校正；plush-7刻意給比任何層架淨空高度都高的數字，
// 確保手動測試時一定能碰到「高度硬塞」的情境。
export const ROOM_ITEMS: RoomItem[] = [
  { id: 'plush-1', image: '/dream-room/plush-1.png', realWidthCm: 10, realHeightCm: 14 },
  { id: 'plush-2', image: '/dream-room/plush-2.png', realWidthCm: 8, realHeightCm: 11 },
  { id: 'plush-3', image: '/dream-room/plush-3.png', realWidthCm: 15, realHeightCm: 18 },
  { id: 'plush-4', image: '/dream-room/plush-4.png', realWidthCm: 12, realHeightCm: 12 },
  { id: 'plush-5', image: '/dream-room/plush-5.png', realWidthCm: 20, realHeightCm: 20 },
  { id: 'plush-6', image: '/dream-room/plush-6.png', realWidthCm: 9, realHeightCm: 13 },
  { id: 'plush-7', image: '/dream-room/plush-7.png', realWidthCm: 16, realHeightCm: 22 },
  { id: 'plush-8', image: '/dream-room/plush-8.png', realWidthCm: 13, realHeightCm: 9 },
];

export const ROOM_ITEMS_BY_ID: Record<string, RoomItem> = Object.fromEntries(ROOM_ITEMS.map((item) => [item.id, item]));
