'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { findFormatByKey } from '@/lib/factory/catalog';
import { getFactoryDesignUrl } from '@/lib/supabase/factory';
import type { FactoryDesign, FactoryInventoryItem } from '@/types/database';

export default function Warehouse({
  inventory,
  designs,
}: {
  inventory: FactoryInventoryItem[];
  designs: FactoryDesign[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const designById = new Map(designs.map((d) => [d.id, d]));

  async function handleSell(item: FactoryInventoryItem) {
    setError(null);
    setLoadingId(item.id);
    try {
      const res = await fetch('/api/factory/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formatKey: item.format_key, designId: item.design_id, quantity: item.quantity }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '賣出失敗');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '賣出失敗');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">工廠倉庫</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {inventory.length === 0 ? (
        <p className="text-sm text-neutral-500">倉庫目前是空的，先去上面的機台生產一批看看。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {inventory.map((item) => {
            const format = findFormatByKey(item.format_key);
            const design = designById.get(item.design_id);
            if (!format) return null;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded border border-neutral-200 px-4 py-3"
              >
                {design && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getFactoryDesignUrl(design.storage_path)}
                    alt={design.name ?? '設計圖'}
                    className="h-12 w-12 shrink-0 rounded border border-neutral-200 object-cover"
                  />
                )}
                <div className="flex-1 text-sm">
                  <p>
                    {format.name} × {item.quantity}
                  </p>
                  <p className="text-xs text-neutral-500">全賣掉可得 {item.quantity * format.sellPricePerUnit} 幣</p>
                </div>
                <button
                  type="button"
                  disabled={loadingId === item.id}
                  onClick={() => handleSell(item)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:border-neutral-500 disabled:opacity-50"
                >
                  {loadingId === item.id ? '賣出中…' : '全部賣掉'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
