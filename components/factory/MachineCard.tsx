'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FactoryMachine } from '@/lib/factory/catalog';
import { getFactoryDesignUrl } from '@/lib/supabase/factory';
import type { FactoryDesign, FactoryProductionBatch } from '@/types/database';
import Countdown from './Countdown';

export default function MachineCard({
  machine,
  designs,
  activeBatch,
}: {
  machine: FactoryMachine;
  designs: FactoryDesign[];
  activeBatch: FactoryProductionBatch | null;
}) {
  const router = useRouter();
  const [formatKey, setFormatKey] = useState(machine.formats[0].key);
  const [designId, setDesignId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const selectedFormat = machine.formats.find((f) => f.key === formatKey)!;
  const isReady = activeBatch ? new Date(activeBatch.ready_at).getTime() <= now : false;

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleStart() {
    if (!designId) {
      setError('請先選一張設計圖');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/factory/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineKey: machine.key, formatKey, designId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '開始生產失敗');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '開始生產失敗');
    } finally {
      setLoading(false);
    }
  }

  async function handleCollect() {
    if (!activeBatch) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/factory/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatch.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '收成失敗');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '收成失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5">
      <div>
        <h3 className="text-base font-semibold">{machine.name}</h3>
        <p className="text-xs text-neutral-500">
          原料：{machine.materialName}（{machine.materialCost} 幣／份）
        </p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {activeBatch ? (
        <div className="flex flex-col gap-2 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <p>
            生產中：{machine.formats.find((f) => f.key === activeBatch.format_key)?.name} ×{' '}
            {activeBatch.quantity}
          </p>
          {isReady ? (
            <button
              type="button"
              disabled={loading}
              onClick={handleCollect}
              className="self-start rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {loading ? '收成中…' : '收成'}
            </button>
          ) : (
            <p className="text-neutral-600">
              <Countdown readyAt={activeBatch.ready_at} onComplete={() => router.refresh()} />
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {machine.formats.map((format) => (
              <button
                key={format.key}
                type="button"
                onClick={() => setFormatKey(format.key)}
                className={`rounded border px-3 py-1.5 text-xs ${
                  format.key === formatKey
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
                }`}
              >
                {format.name}
              </button>
            ))}
          </div>

          <p className="text-xs text-neutral-500">
            預期產出 {selectedFormat.outputQuantity} 件，全賣掉約 {selectedFormat.outputQuantity * selectedFormat.sellPricePerUnit}{' '}
            幣，生產約需 {selectedFormat.productionMinutes} 分鐘
          </p>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {designs.map((design) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={design.id}
                src={getFactoryDesignUrl(design.storage_path)}
                alt={design.name ?? '設計圖'}
                onClick={() => setDesignId(design.id)}
                className={`aspect-square w-full cursor-pointer rounded border object-cover ${
                  design.id === designId ? 'border-neutral-900 ring-2 ring-neutral-900' : 'border-neutral-200'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleStart}
            className="self-start rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? '處理中…' : `開始生產（花費 ${machine.materialCost} 幣）`}
          </button>
        </div>
      )}
    </div>
  );
}
