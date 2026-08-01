'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WAREHOUSE_UPGRADE_AMOUNT, WAREHOUSE_UPGRADE_COST } from '@/lib/market/catalog';

export default function UpgradeWarehouseButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/factory/upgrade-warehouse', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '升級失敗');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '升級失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={handleUpgrade}
        className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:border-neutral-500 disabled:opacity-50"
      >
        {loading ? '升級中…' : `花 ${WAREHOUSE_UPGRADE_COST} 幣升級倉庫容量 +${WAREHOUSE_UPGRADE_AMOUNT}`}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
