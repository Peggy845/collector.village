'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GRID_SIZE } from '@/lib/market/placement';
import type {
  Facing,
  FactoryDesign,
  FactoryInventoryItem,
  FurnitureType,
  MarketFurniture,
  MarketFurnitureSlot,
} from '@/types/database';
import FurnitureGridCell from '@/components/market/FurnitureGridCell';
import FurniturePicker from '@/components/market/FurniturePicker';
import FurnitureDetailPanel from '@/components/market/FurnitureDetailPanel';

// 超市空間網格的核心狀態機（取代舊版平鋪列表 ShelfCard.tsx 的角色），比照收納冊
// AlbumEditor.tsx 的「先選目標、後選內容」單一 state 管理法，只是這裡的 state 帶著座標/朝向/
// 暫存資訊（見 idea/開發日誌.md 2026-08-05 討論的完整設計）：
//   - idle：什麼都沒選中，點有家具的格子會選中它。
//   - placing：從 FurniturePicker 選了種類，等點空格放置。
//   - moving：從 FurnitureDetailPanel 按了「移動」，等點空格搬過去（點自己原本的格子＝原地轉向）。
//   - selected：點了已放置的家具，顯示 FurnitureDetailPanel。
type Interaction =
  | { mode: 'idle' }
  | { mode: 'placing'; furnitureType: FurnitureType; facing: Facing }
  | { mode: 'moving'; furnitureId: number; facing: Facing }
  | { mode: 'selected'; furnitureId: number };

export default function MarketGrid({
  furniture,
  slots,
  inventory,
  designs,
  marketOpen,
  marketClosedAt,
  balance,
}: {
  furniture: MarketFurniture[];
  slots: MarketFurnitureSlot[];
  inventory: FactoryInventoryItem[];
  designs: FactoryDesign[];
  marketOpen: boolean;
  marketClosedAt: string | null;
  balance: number;
}) {
  const router = useRouter();
  const [interaction, setInteraction] = useState<Interaction>({ mode: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // 暫停營業時，畫面上的倒數要凍結在暫停當下（見 app/api/market/toggle-open/route.ts）。
  const effectiveNow = marketOpen ? now : marketClosedAt ? new Date(marketClosedAt).getTime() : now;

  const furnitureByCell = useMemo(() => {
    const map = new Map<string, MarketFurniture>();
    for (const item of furniture) map.set(`${item.grid_x}:${item.grid_y}`, item);
    return map;
  }, [furniture]);

  const slotsByFurniture = useMemo(() => {
    const map = new Map<number, MarketFurnitureSlot[]>();
    for (const slot of slots) {
      const list = map.get(slot.furniture_id) ?? [];
      list.push(slot);
      map.set(slot.furniture_id, list);
    }
    return map;
  }, [slots]);

  const selectedFurniture =
    interaction.mode === 'selected' ? furniture.find((f) => f.id === interaction.furnitureId) : undefined;

  function cancel() {
    setInteraction({ mode: 'idle' });
    setError(null);
  }

  async function submitPlace(x: number, y: number) {
    if (interaction.mode !== 'placing') return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/market/buy-furniture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ furnitureType: interaction.furnitureType, x, y, facing: interaction.facing }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '放置失敗');
      setInteraction({ mode: 'idle' });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '放置失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMove(x: number, y: number) {
    if (interaction.mode !== 'moving') return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/market/move-furniture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ furnitureId: interaction.furnitureId, x, y, facing: interaction.facing }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '移動失敗');
      setInteraction({ mode: 'selected', furnitureId: interaction.furnitureId });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '移動失敗');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCellClick(x: number, y: number) {
    const occupant = furnitureByCell.get(`${x}:${y}`);
    if (interaction.mode === 'placing') {
      if (occupant || submitting) return;
      void submitPlace(x, y);
      return;
    }
    if (interaction.mode === 'moving') {
      if (submitting) return;
      if (occupant && occupant.id !== interaction.furnitureId) return;
      void submitMove(x, y);
      return;
    }
    if (occupant) {
      setInteraction({ mode: 'selected', furnitureId: occupant.id });
      setError(null);
    }
  }

  const cells = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const occupant = furnitureByCell.get(`${x}:${y}`);
      const highlighted = (interaction.mode === 'placing' || interaction.mode === 'moving') && !occupant;
      const selected =
        interaction.mode === 'selected'
          ? occupant?.id === interaction.furnitureId
          : interaction.mode === 'moving'
            ? occupant?.id === interaction.furnitureId
            : false;
      cells.push(
        <FurnitureGridCell
          key={`${x}:${y}`}
          x={x}
          y={y}
          furniture={occupant}
          selected={selected}
          highlighted={highlighted}
          onClick={() => handleCellClick(x, y)}
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {(interaction.mode === 'idle' || interaction.mode === 'selected') && (
        <FurniturePicker
          balance={balance}
          disabled={submitting}
          onPick={(type) => setInteraction({ mode: 'placing', furnitureType: type, facing: 'down' })}
        />
      )}

      {(interaction.mode === 'placing' || interaction.mode === 'moving') && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <span>{interaction.mode === 'placing' ? '點擊空格放置家具' : '點擊空格移動家具（點原本的格子可以原地換朝向）'}</span>
          <label className="flex items-center gap-1">
            朝向：
            <select
              value={interaction.facing}
              onChange={(e) =>
                setInteraction((prev) =>
                  prev.mode === 'placing' || prev.mode === 'moving'
                    ? { ...prev, facing: e.target.value as Facing }
                    : prev
                )
              }
              className="rounded border border-neutral-300 px-1 py-0.5"
            >
              <option value="down">朝下</option>
              <option value="up">朝上</option>
            </select>
          </label>
          <button type="button" onClick={cancel} className="underline hover:text-emerald-950">
            取消
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="max-h-[520px] max-w-full overflow-auto rounded border border-neutral-200 p-2">
        <div
          className="grid w-fit gap-0"
          style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1.5rem)`, gridTemplateRows: `repeat(${GRID_SIZE}, 1.5rem)` }}
        >
          {cells}
        </div>
      </div>

      {selectedFurniture && (
        <FurnitureDetailPanel
          furniture={selectedFurniture}
          slots={slotsByFurniture.get(selectedFurniture.id) ?? []}
          inventory={inventory}
          designs={designs}
          now={effectiveNow}
          marketOpen={marketOpen}
          onListed={() => router.refresh()}
          onStartMove={() => setInteraction({ mode: 'moving', furnitureId: selectedFurniture.id, facing: selectedFurniture.facing })}
          onDeselect={cancel}
        />
      )}
    </div>
  );
}
