import { findFurnitureDef } from '@/lib/market/furniture';
import type { MarketFurniture } from '@/types/database';
import FurnitureSprite from '@/components/market/FurnitureSprite';

// 純展示格子，30×30 網格裡的一格（見 components/market/MarketGrid.tsx）。互動邏輯（要不要
// 回應點擊、點了要做什麼）交給呼叫端決定，這裡只負責畫出這一格目前的樣子。
export default function FurnitureGridCell({
  x,
  y,
  furniture,
  selected,
  highlighted,
  onClick,
}: {
  x: number;
  y: number;
  furniture: MarketFurniture | undefined;
  /** 目前被選中查看/移動的家具 */
  selected: boolean;
  /** 放置/移動模式下，這格是否可以點擊（空格才可以） */
  highlighted: boolean;
  onClick: () => void;
}) {
  const label = furniture ? `${findFurnitureDef(furniture.furniture_type)?.name ?? furniture.furniture_type}（${x},${y}）` : `空格（${x},${y}）`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-6 w-6 items-center justify-center border text-xs transition-colors ${
        selected
          ? 'border-neutral-900 bg-neutral-200'
          : highlighted
            ? 'border-emerald-400 bg-emerald-50 hover:bg-emerald-100'
            : 'border-neutral-200 bg-white hover:bg-neutral-50'
      }`}
    >
      {furniture && <FurnitureSprite type={furniture.furniture_type} facing={furniture.facing} />}
    </button>
  );
}
