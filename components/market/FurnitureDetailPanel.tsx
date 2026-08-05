'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeSlotRemaining, isSlotActive } from '@/lib/market/catalog';
import { findFurnitureDef } from '@/lib/market/furniture';
import type { FactoryDesign, FactoryInventoryItem, MarketFurniture, MarketFurnitureSlot } from '@/types/database';
import SlotView from '@/components/market/SlotView';
import ListingPanel from '@/components/market/ListingPanel';

// 選中一個家具後顯示的面板（取代舊版 ShelfCard.tsx 的大部分內容）：slot 列表 + 上架表單 +
// 「移動」按鈕 + 「取消選取」按鈕。放置/移動本身的網格互動邏輯在 components/market/MarketGrid.tsx，
// 這裡只管顯示跟這個家具的既有商品操作（上架/下架）。
export default function FurnitureDetailPanel({
  furniture,
  slots,
  inventory,
  designs,
  now,
  marketOpen,
  onListed,
  onStartMove,
  onDeselect,
}: {
  furniture: MarketFurniture;
  slots: MarketFurnitureSlot[];
  inventory: FactoryInventoryItem[];
  designs: FactoryDesign[];
  now: number;
  marketOpen: boolean;
  onListed: () => void;
  onStartMove: () => void;
  onDeselect: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const def = findFurnitureDef(furniture.furniture_type);
  const usedCapacity = slots.reduce((sum, s) => sum + computeSlotRemaining(s, now), 0);
  const freeSpace = furniture.capacity === null ? 0 : Math.max(0, furniture.capacity - usedCapacity);

  async function handleDelist(slotId: number) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/market/delist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '下架失敗');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '下架失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold">
          {def?.name ?? furniture.furniture_type} #{furniture.id}
        </h3>
        <div className="flex items-center gap-2">
          {furniture.capacity !== null && (
            <p className="text-xs text-neutral-500">
              空位 {freeSpace}/{furniture.capacity}
            </p>
          )}
          <button
            type="button"
            onClick={onStartMove}
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:border-neutral-500"
          >
            移動
          </button>
          <button
            type="button"
            onClick={onDeselect}
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:border-neutral-500"
          >
            取消選取
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {furniture.capacity === null ? (
        <p className="text-xs text-neutral-400">純裝飾家具，不能放商品。</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {slots
              .filter((slot) => !(isSlotActive(slot, now) && computeSlotRemaining(slot, now) === 0))
              .sort((a, b) => new Date(a.listed_at).getTime() - new Date(b.listed_at).getTime())
              .map((slot) => (
                <SlotView
                  key={slot.id}
                  slot={slot}
                  now={now}
                  onDelist={handleDelist}
                  loading={loading}
                  designs={designs}
                  marketOpen={marketOpen}
                />
              ))}
          </div>

          <ListingPanel
            furnitureId={furniture.id}
            furnitureType={furniture.furniture_type}
            freeSpace={freeSpace}
            inventory={inventory}
            designs={designs}
            onListed={onListed}
          />
        </>
      )}
    </div>
  );
}
