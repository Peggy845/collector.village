'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CollectAllButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCollectAll() {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch('/api/factory/collect-all', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '一鍵收成失敗');
      if (body.collected === 0 && body.skipped === 0) {
        setMessage('目前沒有已完成、還沒收成的批次。');
      } else if (body.skipped > 0) {
        setMessage(`已收成 ${body.collected} 批。已超過倉庫容量，請先上架商品，或批次收成剩下的 ${body.skipped} 批。`);
      } else {
        setMessage(`已收成 ${body.collected} 批。`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '一鍵收成失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={handleCollectAll}
        className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:border-neutral-500 disabled:opacity-50"
      >
        {loading ? '收成中…' : '一鍵收成'}
      </button>
      {message && <p className="text-xs text-neutral-600">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
