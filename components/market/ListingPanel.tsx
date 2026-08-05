'use client';

import { useState } from 'react';
import { findFormatByKey } from '@/lib/factory/catalog';
import { isFormatAllowedForFurniture } from '@/lib/market/furniture';
import type { FactoryDesign, FactoryInventoryItem, FurnitureType } from '@/types/database';

// 上架清單（2026-08-01 依 idea/上架系統.jpg wireframe 重做，同日再依「預設值=庫存/剩餘空位」
// 補充定案調整；2026-08-05 從 ShelfCard.tsx 抽出，新增依家具種類過濾不相容格式）：列出工廠倉庫裡
// 這個家具能放的品項，每一列都有自己的輸入框跟「上架」按鈕，不用先勾選——因為預設玩家通常想整批
// 上架，輸入框預設值直接是 min(這項庫存, 家具目前剩餘空位)：家具還空著的時候每項各自顯示自己的
// 庫存量（不會互相卡到）；一旦上架了東西、空位變少，其他還沒上架品項的預設值會跟著自動降到
// 「剩餘空位」（除非玩家自己手動改過那一列的數字，手動改過的值會保留，不會被自動蓋掉）。
export default function ListingPanel({
  furnitureId,
  furnitureType,
  freeSpace,
  inventory,
  designs,
  onListed,
}: {
  furnitureId: number;
  furnitureType: FurnitureType;
  freeSpace: number;
  inventory: FactoryInventoryItem[];
  designs: FactoryDesign[];
  onListed: () => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const designById = new Map(designs.map((d) => [d.id, d]));

  const compatibleInventory = inventory.filter((item) => isFormatAllowedForFurniture(furnitureType, item.format_key));
  const incompatibleCount = inventory.length - compatibleInventory.length;

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
          furnitureId,
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

  if (compatibleInventory.length === 0) {
    return (
      <p className="text-xs text-neutral-400">
        {inventory.length === 0
          ? '工廠倉庫目前沒有東西可以上架。'
          : '工廠倉庫裡的東西這個家具都放不下（格式不相容）。'}
      </p>
    );
  }

  const keyword = filter.trim().toLowerCase();
  const visibleInventory = keyword
    ? compatibleInventory.filter((item) => {
        const format = findFormatByKey(item.format_key);
        const design = designById.get(item.design_id);
        return `${format?.name ?? ''}${design?.name ?? ''}`.toLowerCase().includes(keyword);
      })
    : compatibleInventory;

  return (
    <div className="flex flex-col gap-2 rounded border border-dashed border-neutral-300 p-3 text-sm">
      <p className="text-xs text-neutral-500">待上架（預設數量已經幫你填好，可以直接按上架，或自己改數字）</p>
      {incompatibleCount > 0 && (
        <p className="text-xs text-neutral-400">還有 {incompatibleCount} 種格式這個家具放不下，沒有列在下面。</p>
      )}
      {compatibleInventory.length > 8 && (
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜尋格式或設計圖名稱…"
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        />
      )}
      {visibleInventory.length === 0 && <p className="text-xs text-neutral-400">找不到符合「{filter}」的品項。</p>}
      <ul className="flex flex-col gap-1.5">
        {visibleInventory.map((item) => {
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
      {freeSpace <= 0 && <p className="text-xs text-neutral-400">這個家具目前沒有空位了。</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
