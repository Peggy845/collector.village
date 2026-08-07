import Image from 'next/image';
import type { Facing, FurnitureType } from '@/types/database';

// 家具的視覺表現，沿用工廠 MachineScene.tsx 的模式：用 Record<種類,圖片路徑> 對應固定圖片。
//
// 2026-08-07 改版：家具美術風格從「純頂視角平面圖示」改成「正面陳列」（像 idea/RPG購物*.png
// 那種經典JRPG商店地圖畫法，貨架前面看得到商品輪廓），朝上/朝下兩種朝向不能再靠 CSS 垂直翻轉
// 共用一張圖（正面圖上下顛倒會很怪），改成每種家具各畫「正面」「背面」兩張圖（見
// idea/gemini-超市家具美術prompt.md）。朝下＝展示面朝玩家（用正面圖），朝上＝展示面朝畫面上方、
// 玩家從這一側看到的是家具背面（用背面圖）。Peggy 生完圖後換上，見 public/market/。
//
// 圖檔到位當天發現 Gemini 輸出的「透明背景」其實是把預覽棋盤格畫成不透明像素，不是真的alpha
// 透明——用 scripts/fix-transparent-png.mjs 處理過（flood fill 清成真透明+裁切+縮到480px）才能用。
const FURNITURE_SPRITE: Record<FurnitureType, Record<Facing, string>> = {
  bookshelf: { down: '/market/bookshelf-front.png', up: '/market/bookshelf-back.png' },
  pegboard: { down: '/market/pegboard-front.png', up: '/market/pegboard-back.png' },
  stacking_bin: { down: '/market/stacking-bin-front.png', up: '/market/stacking-bin-back.png' },
  cashier: { down: '/market/cashier-front.png', up: '/market/cashier-back.png' },
};

export default function FurnitureSprite({ type, facing }: { type: FurnitureType; facing: Facing }) {
  return (
    <span className="relative block h-full w-full" aria-hidden>
      <Image src={FURNITURE_SPRITE[type][facing]} alt="" fill className="object-contain" sizes="24px" />
    </span>
  );
}
