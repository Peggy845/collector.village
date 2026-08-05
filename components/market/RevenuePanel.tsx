'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { findFormatByKey } from '@/lib/factory/catalog';
import { computeSlotSoldSoFar } from '@/lib/market/catalog';
import type { MarketFurnitureSlot } from '@/types/database';

// 本日營業額（見 PROJECT_PROGRESS.md 已定案項目 32）：賣出的錢不會直接變成可花的遊戲幣，
// 要玩家自己按「入帳」才會真的存進餘額——這樣才有「在經營一間店」的感覺，而不是東西一賣掉
// 錢就自動到手。「結算明細」純粹是把同一批已經抓回來的 slot 資料在前端算給玩家看，
// 不需要另外呼叫 API，真正會動到資料庫/遊戲幣的只有「入帳」這個按鈕。
export default function RevenuePanel({
  slots,
  marketOpen,
  marketClosedAt,
}: {
  slots: MarketFurnitureSlot[];
  marketOpen: boolean;
  marketClosedAt: string | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [showDetail, setShowDetail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const effectiveNow = marketOpen ? now : marketClosedAt ? new Date(marketClosedAt).getTime() : now;

  const breakdown = useMemo(() => {
    const byFormat = new Map<string, { name: string; quantity: number; revenue: number }>();
    let total = 0;
    for (const slot of slots) {
      const format = findFormatByKey(slot.format_key);
      if (!format) continue;
      const newlySold = computeSlotSoldSoFar(slot, effectiveNow) - slot.collected_quantity;
      if (newlySold <= 0) continue;
      const revenue = newlySold * format.sellPricePerUnit;
      total += revenue;
      const existing = byFormat.get(slot.format_key);
      if (existing) {
        existing.quantity += newlySold;
        existing.revenue += revenue;
      } else {
        byFormat.set(slot.format_key, { name: format.name, quantity: newlySold, revenue });
      }
    }
    return { items: Array.from(byFormat.values()), total };
  }, [slots, effectiveNow]);

  async function handleDeposit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/market/collect', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '入帳失敗');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '入帳失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-500">本日營業額</p>
          <p className="mt-1 text-lg font-medium">{breakdown.total} 幣</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:border-neutral-500"
          >
            {showDetail ? '收起明細' : '結算明細'}
          </button>
          <button
            type="button"
            disabled={loading || breakdown.total === 0}
            onClick={handleDeposit}
            className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {loading ? '入帳中…' : '入帳'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {showDetail && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          {breakdown.items.length === 0 ? (
            <p className="text-xs text-neutral-400">目前沒有還沒入帳的營業額。</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {breakdown.items.map((item) => (
                <li key={item.name} className="flex justify-between text-neutral-600">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span>{item.revenue} 幣</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
