'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MarketAutoRestockToggle({ autoRestock }: { autoRestock: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/market/toggle-auto-restock', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '切換失敗');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '切換失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={handleToggle}
        className={`rounded border px-3 py-1.5 text-xs disabled:opacity-50 ${
          autoRestock
            ? 'border-sky-300 bg-sky-50 text-sky-700 hover:border-sky-400'
            : 'border-neutral-300 bg-neutral-100 text-neutral-500 hover:border-neutral-400'
        }`}
      >
        {loading ? '切換中…' : autoRestock ? '自動上架中・點擊改手動上架' : '手動上架中・點擊改自動上架'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
