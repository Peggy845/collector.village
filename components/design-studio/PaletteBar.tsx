'use client';

import { PALETTE } from '@/lib/design-studio/palette';

const CHECKER_BG = {
  backgroundImage:
    'linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
};

export default function PaletteBar({
  selectedColor,
  onSelect,
}: {
  selectedColor: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((color) => (
        <button
          key={color.index}
          type="button"
          title={color.name}
          aria-label={color.name}
          onClick={() => onSelect(color.index)}
          className={`h-8 w-8 rounded border-2 ${
            selectedColor === color.index ? 'border-neutral-900' : 'border-neutral-200'
          }`}
          style={{ backgroundColor: color.hex ?? 'transparent', ...(color.hex ? {} : CHECKER_BG) }}
        />
      ))}
    </div>
  );
}
