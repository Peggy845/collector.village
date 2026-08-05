import type { Facing, FurnitureType } from '@/types/database';

// 家具的視覺表現，沿用工廠 MachineScene.tsx / 舊版 ShelfScene.tsx 的模式：用 Record<種類,圖片路徑>
// 對應固定圖片，朝向只有上/下兩種，靠 CSS 垂直翻轉（scaleY(-1)）從同一張圖產生第二個朝向，
// 不用請 Gemini 分別畫兩張（見 idea/gemini-超市家具美術prompt.md）。
//
// Phase 3（2026-08-05）先用 emoji 佔位，Phase 4 真圖到位後只改這個檔案內部實作，
// 外部 props 介面不變（呼應 placeholder-first 開發順序，見 PROJECT_PROGRESS.md）。
const FURNITURE_EMOJI: Record<FurnitureType, string> = {
  bookshelf: '📚',
  pegboard: '🪝',
  stacking_bin: '📦',
  cashier: '💰',
};

export default function FurnitureSprite({ type, facing }: { type: FurnitureType; facing: Facing }) {
  return (
    <span
      className="flex h-full w-full items-center justify-center text-base leading-none"
      style={facing === 'up' ? { transform: 'scaleY(-1)' } : undefined}
      aria-hidden
    >
      {FURNITURE_EMOJI[type]}
    </span>
  );
}
