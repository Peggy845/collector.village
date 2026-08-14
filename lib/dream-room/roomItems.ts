export interface RoomItem {
  id: string;
  image: string;
  realWidthCm: number;
  realHeightCm: number;
}

// 真實尺寸，2026-08-14從Peggy手量的照片（idea/size_plush-x.jpg）讀出來的，已經過Peggy確認。
export const ROOM_ITEMS: RoomItem[] = [
  { id: 'plush-1', image: '/dream-room/plush-1.png', realWidthCm: 14, realHeightCm: 18 },
  { id: 'plush-2', image: '/dream-room/plush-2.png', realWidthCm: 10, realHeightCm: 10 },
  { id: 'plush-3', image: '/dream-room/plush-3.png', realWidthCm: 10, realHeightCm: 16.5 },
  { id: 'plush-4', image: '/dream-room/plush-4.png', realWidthCm: 14, realHeightCm: 21 },
  { id: 'plush-5', image: '/dream-room/plush-5.png', realWidthCm: 6, realHeightCm: 9 },
  { id: 'plush-6', image: '/dream-room/plush-6.png', realWidthCm: 6, realHeightCm: 9 },
  { id: 'plush-7', image: '/dream-room/plush-7.png', realWidthCm: 10, realHeightCm: 12 },
  { id: 'plush-8', image: '/dream-room/plush-8.png', realWidthCm: 8, realHeightCm: 13 },
];

export const ROOM_ITEMS_BY_ID: Record<string, RoomItem> = Object.fromEntries(ROOM_ITEMS.map((item) => [item.id, item]));
