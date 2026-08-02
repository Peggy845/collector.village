'use client';

import { GRID_SIZE, paletteColorFor } from '@/lib/design-studio/palette';

// 純顯示用的小縮圖，直接用像素陣列即時畫出來（不用等圖片上傳/下載），
// 給 DesignLibraryModal 列表項目用（見 components/design-studio/DesignLibraryModal.tsx）。
const CHECKER_BG = {
  backgroundImage:
    'linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%)',
  backgroundSize: '6px 6px',
  backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
};

export default function MiniPixelPreview({ pixelData }: { pixelData: number[] }) {
  return (
    <div
      className="grid h-12 w-12 shrink-0 overflow-hidden rounded border border-neutral-200"
      style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`, ...CHECKER_BG }}
    >
      {pixelData.map((colorIndex, idx) => {
        const color = paletteColorFor(colorIndex);
        return <div key={idx} style={{ backgroundColor: color.hex ?? 'transparent' }} />;
      })}
    </div>
  );
}
