'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MARKET_SHELF_COST } from '@/lib/market/catalog';

export default function BuyShelfButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/market/buy-shelf', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '買貨架失敗');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '買貨架失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={handleBuy}
        className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {loading ? '購買中…' : `買一個新貨架（${MARKET_SHELF_COST} 幣）`}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
