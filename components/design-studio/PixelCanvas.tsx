'use client';

import { GRID_SIZE, paletteColorFor } from '@/lib/design-studio/palette';

// 24×24格畫布：滑鼠down+enter連續上色，觸控用 touchstart/touchmove + elementFromPoint 讀
// data-idx 判斷觸控滑過哪一格（見 idea/project-brief.md 第四節demo驗證過的做法）。
const CHECKER_BG = {
  backgroundImage:
    'linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
};

export default function PixelCanvas({
  pixelData,
  onChange,
  selectedColor,
}: {
  pixelData: number[];
  onChange: (next: number[]) => void;
  selectedColor: number;
}) {
  function paintCell(idx: number) {
    if (pixelData[idx] === selectedColor) return;
    const next = [...pixelData];
    next[idx] = selectedColor;
    onChange(next);
  }

  function paintFromPoint(x: number, y: number) {
    const el = document.elementFromPoint(x, y);
    const idxAttr = el?.getAttribute('data-idx');
    if (idxAttr === null || idxAttr === undefined) return;
    paintCell(Number(idxAttr));
  }

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    paintFromPoint(touch.clientX, touch.clientY);
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault(); // 拖曳畫圖時不要讓頁面跟著滾動
    const touch = e.touches[0];
    if (!touch) return;
    paintFromPoint(touch.clientX, touch.clientY);
  }

  return (
    <div
      className="grid w-full max-w-md touch-none select-none gap-px rounded border border-neutral-300"
      style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`, ...CHECKER_BG }}
      onDragStart={(e) => e.preventDefault()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      {pixelData.map((colorIndex, idx) => {
        const color = paletteColorFor(colorIndex);
        return (
          <div
            key={idx}
            data-idx={idx}
            onMouseDown={() => paintCell(idx)}
            onMouseEnter={(e) => {
              if (e.buttons === 1) paintCell(idx);
            }}
            className="aspect-square cursor-pointer"
            style={{ backgroundColor: color.hex ?? 'transparent' }}
          />
        );
      })}
    </div>
  );
}
