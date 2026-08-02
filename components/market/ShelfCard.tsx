'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { findFormatByKey } from '@/lib/factory/catalog';
import { computeSlotRemaining, isSlotActive, minutesUntilSoldOut } from '@/lib/market/catalog';
import type { FactoryDesign, FactoryInventoryItem, MarketShelf, MarketShelfSlot } from '@/types/database';
import DesignThumb from '@/components/factory/DesignThumb';
import ShelfScene from '@/components/market/ShelfScene';

function SlotView({
  slot,
  now,
  onDelist,
  loading,
  designs,
  marketOpen,
}: {
  slot: MarketShelfSlot;
  now: number;
  onDelist: (id: number) => void;
  loading: boolean;
  designs: FactoryDesign[];
  marketOpen: boolean;
}) {
  const format = findFormatByKey(slot.format_key);
  const design = designs.find((d) => d.id === slot.design_id);
  const remaining = computeSlotRemaining(slot, now);
  const active = isSlotActive(slot, now);
  const minutesLeft = minutesUntilSoldOut(slot, now);

  // 已經賣完的格子不會顯示在貨架上（見 idea/下架BUG.png：賣完的東西沒有東西可以「下架」，
  // 顯示一個帶下架按鈕的「已售完」列反而讓人誤以為還有實體庫存可以收回，貨架該看起來是空的）。
  // 呼叫端（ShelfCard）已經把這種 slot 過濾掉不渲染，這裡不會走到 soldOut 分支，
  // 但保留這個分支邏輯以防萬一（例如網路延遲時畫面暫時還沒收到最新資料）。
  const soldOut = active && remaining === 0;
  if (soldOut) return null;

  return (
    <div className="flex flex-col gap-1 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <div className="flex items-center gap-2">
        {design && (
          <DesignThumb design={design} className="h-10 w-10 shrink-0 rounded border border-neutral-200 object-cover" />
        )}
        {/* 只顯示品項名稱，不要在這裡重複標數量——原本這裡的「× slot.quantity」是上架當下的原始件數，
            賣掉之後仍然不變，跟下面「剩 X 件」放在一起會讓人誤以為還有兩種不同的數字（2026-08-01 修正）。 */}
        <p>{format?.name ?? slot.format_key}</p>
      </div>
      {!active ? (
        <p className="text-xs text-neutral-400">排隊中，等前面賣完才會開始賣（共 {slot.quantity} 件）</p>
      ) : (
        <p className="text-xs text-neutral-600">
          剩 {remaining} 件・約 {minutesLeft} 分鐘後售罄{!marketOpen && '（暫停營業中，倒數已凍結）'}
        </p>
      )}
      <button
        type="button"
        disabled={loading}
        onClick={() => onDelist(slot.id)}
        className="mt-1 self-start rounded border border-neutral-300 px-2 py-1 text-xs hover:border-neutral-500 disabled:opacity-50"
      >
        下架
      </button>
    </div>
  );
}

// 上架清單（2026-08-01 依 idea/上架系統.jpg wireframe 重做，同日再依「預設值=庫存/剩餘空位」
// 補充定案調整）：列出工廠倉庫裡所有可上架的品項，每一列都有自己的輸入框跟「上架」按鈕，
// 不用先勾選——因為預設玩家通常想整批上架，輸入框預設值直接是 min(這項庫存, 貨架目前剩餘空位)：
// 貨架還空著的時候每項各自顯示自己的庫存量（不會互相卡到）；一旦上架了東西、空位變少，
// 其他還沒上架品項的預設值會跟著自動降到「剩餘空位」（除非玩家自己手動改過那一列的數字，
// 手動改過的值會保留，不會被自動蓋掉）。
function ListingPanel({
  shelfId,
  freeSpace,
  inventory,
  designs,
  onListed,
}: {
  shelfId: number;
  freeSpace: number;
  inventory: FactoryInventoryItem[];
  designs: FactoryDesign[];
  onListed: () => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const designById = new Map(designs.map((d) => [d.id, d]));

  function defaultQuantity(stock: number): number {
    return Math.max(1, Math.min(stock, Math.max(1, freeSpace)));
  }

  async function handleList(item: FactoryInventoryItem) {
    const key = `${item.format_key}:${item.design_id}`;
    const quantity = overrides[key] ?? defaultQuantity(item.quantity);
    setError(null);
    setLoadingKey(key);
    try {
      const res = await fetch('/api/market/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shelfId,
          formatKey: item.format_key,
          designId: item.design_id,
          quantity,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '上架失敗');
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      onListed();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上架失敗');
    } finally {
      setLoadingKey(null);
    }
  }

  if (inventory.length === 0) {
    return <p className="text-xs text-neutral-400">工廠倉庫目前沒有東西可以上架。</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-dashed border-neutral-300 p-3 text-sm">
      <p className="text-xs text-neutral-500">待上架（預設數量已經幫你填好，可以直接按上架，或自己改數字）</p>
      <ul className="flex flex-col gap-1.5">
        {inventory.map((item) => {
          const key = `${item.format_key}:${item.design_id}`;
          const format = findFormatByKey(item.format_key);
          const design = designById.get(item.design_id);
          const ceiling = Math.max(1, Math.min(item.quantity, Math.max(1, freeSpace)));
          const value = overrides[key] ?? defaultQuantity(item.quantity);
          return (
            <li key={key} className="flex items-center gap-2">
              <span className="flex-1 text-xs text-neutral-700">
                {format?.name ?? item.format_key}
                {design?.name ? `（${design.name}）` : ''}・庫存 {item.quantity}
              </span>
              <input
                type="number"
                min={1}
                max={ceiling}
                value={value}
                onChange={(e) =>
                  setOverrides((prev) => ({ ...prev, [key]: Math.max(1, Math.min(ceiling, Number(e.target.value))) }))
                }
                className="w-16 rounded border border-neutral-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={loadingKey === key || freeSpace <= 0}
                onClick={() => handleList(item)}
                className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
              >
                {loadingKey === key ? '上架中…' : '上架'}
              </button>
            </li>
          );
        })}
      </ul>
      {freeSpace <= 0 && <p className="text-xs text-neutral-400">這個貨架目前沒有空位了。</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ShelfCard({
  shelf,
  slots,
  inventory,
  designs,
  marketOpen,
  marketClosedAt,
}: {
  shelf: MarketShelf;
  slots: MarketShelfSlot[];
  inventory: FactoryInventoryItem[];
  designs: FactoryDesign[];
  marketOpen: boolean;
  marketClosedAt: string | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justListed, setJustListed] = useState(false);

  function flashJustListed() {
    setJustListed(true);
    setTimeout(() => setJustListed(false), 1500);
  }

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // 暫停營業時，畫面上的倒數要凍結在暫停當下，不能繼續用真實的現在時間算
  // （見 app/api/market/toggle-open/route.ts：重新營業時才會把凍結的時間補回 active_from）。
  const effectiveNow = marketOpen ? now : marketClosedAt ? new Date(marketClosedAt).getTime() : now;

  const usedCapacity = useMemo(
    () => slots.reduce((sum, s) => sum + computeSlotRemaining(s, effectiveNow), 0),
    [slots, effectiveNow]
  );
  const freeSpace = Math.max(0, shelf.capacity - usedCapacity);
  const hasStock = usedCapacity > 0;
  const isFull = freeSpace <= 0;

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

  // 自動上架（見 idea/貨架補滿.png）：從待上架清單最上面那項開始，依序把空位補滿——
  // 最上面的項目庫存夠就整批扣掉補滿空位，不夠就扣完接著換下一項繼續補，
  // 不用玩家自己一項項湊數字。沿用既有的 /api/market/list 逐筆呼叫，不用另外做批次API。
  async function handleAutoFill() {
    if (freeSpace <= 0 || inventory.length === 0) return;
    setError(null);
    setAutoFilling(true);
    let remaining = freeSpace;
    try {
      for (const item of inventory) {
        if (remaining <= 0) break;
        const quantity = Math.min(item.quantity, remaining);
        if (quantity <= 0) continue;
        const res = await fetch('/api/market/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shelfId: shelf.id,
            formatKey: item.format_key,
            designId: item.design_id,
            quantity,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? '自動上架失敗');
        remaining -= quantity;
      }
      flashJustListed();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '自動上架失敗');
    } finally {
      setAutoFilling(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">貨架 #{shelf.id}</h3>
          {/* 純顯示用的營業狀態小標籤，沒有互動功能——切換開關在頁面上方的 MarketOpenToggle */}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              marketOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {marketOpen ? '販賣中' : '商店關閉中'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-neutral-500">
            空位 {freeSpace}/{shelf.capacity}
          </p>
          <button
            type="button"
            disabled={autoFilling || freeSpace <= 0 || inventory.length === 0}
            onClick={handleAutoFill}
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:border-neutral-500 disabled:opacity-50"
          >
            {autoFilling ? '上架中…' : '自動上架'}
          </button>
        </div>
      </div>

      <ShelfScene hasStock={hasStock} isFull={isFull} justListed={justListed} />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-col gap-2">
        {slots
          .filter((slot) => !(isSlotActive(slot, effectiveNow) && computeSlotRemaining(slot, effectiveNow) === 0))
          .sort((a, b) => new Date(a.listed_at).getTime() - new Date(b.listed_at).getTime())
          .map((slot) => (
            <SlotView
              key={slot.id}
              slot={slot}
              now={effectiveNow}
              onDelist={handleDelist}
              loading={loading}
              designs={designs}
              marketOpen={marketOpen}
            />
          ))}
      </div>

      <ListingPanel
        shelfId={shelf.id}
        freeSpace={freeSpace}
        inventory={inventory}
        designs={designs}
        onListed={() => {
          flashJustListed();
          router.refresh();
        }}
      />

      <p className="text-xs text-neutral-400">
        貨架空位以總件數計算，不分商品種類，可以自由分配要放幾種、各放幾件；共用一個「每分鐘賣 1
        件」的速度，先上架的先賣完，不輪流。
      </p>
    </div>
  );
}
