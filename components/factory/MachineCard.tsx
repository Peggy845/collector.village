'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_QUEUE_PER_MACHINE, type FactoryMachine } from '@/lib/factory/catalog';
import type { FactoryDesign, FactoryProductionBatch } from '@/types/database';
import Countdown from './Countdown';
import DesignThumb from './DesignThumb';
import MachineScene, { type MachineStage } from './MachineScene';

function QueueSlot({
  batch,
  machine,
  now,
  isActive,
  onCollect,
  loading,
}: {
  batch: FactoryProductionBatch;
  machine: FactoryMachine;
  now: number;
  isActive: boolean;
  onCollect: (batchId: number) => void;
  loading: boolean;
}) {
  const isReady = isActive && new Date(batch.ready_at).getTime() <= now;
  const format = machine.formats.find((f) => f.key === batch.format_key);

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <p>
        {format?.name} × {batch.quantity}
      </p>
      {isReady ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => onCollect(batch.id)}
          className="self-start rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? '收成中…' : '收成'}
        </button>
      ) : isActive ? (
        <p className="text-neutral-600">
          <Countdown readyAt={batch.ready_at} />
        </p>
      ) : (
        <p className="text-neutral-400">排隊中・輪到它開始生產後約需 {format?.productionMinutes} 分鐘</p>
      )}
    </div>
  );
}

export default function MachineCard({
  machine,
  designs,
  batches,
}: {
  machine: FactoryMachine;
  designs: FactoryDesign[];
  batches: FactoryProductionBatch[];
}) {
  const router = useRouter();
  const [formatKey, setFormatKey] = useState(machine.formats[0].key);
  const [designId, setDesignId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // 收成流程的「打包中→已入庫」動畫覆蓋，跟被收成的那筆批次是否還存在於 batches 無關
  // （router.refresh() 之後那筆批次就會從列表消失），所以不用 batchId 綁定，靠 timeout 自己收尾即可。
  const [collectOverride, setCollectOverride] = useState<'collecting' | 'shipped' | null>(null);
  const [collectFlourish, setCollectFlourish] = useState<{ name: string; quantity: number } | null>(null);

  const selectedFormat = machine.formats.find((f) => f.key === formatKey)!;
  const queueFull = batches.length >= MAX_QUEUE_PER_MACHINE;
  const front = batches[0];
  const frontFormat = front ? machine.formats.find((f) => f.key === front.format_key) : undefined;

  let sceneStage: MachineStage = 'idle';
  let sceneProgress = 0;
  let sceneFormatName: string | undefined;
  let sceneQuantity: number | undefined;

  if (collectOverride) {
    sceneStage = collectOverride;
    sceneFormatName = collectFlourish?.name;
    sceneQuantity = collectFlourish?.quantity;
  } else if (front) {
    const readyMs = new Date(front.ready_at).getTime();
    const startedMs = new Date(front.started_at).getTime();
    sceneFormatName = frontFormat?.name;
    sceneQuantity = front.quantity;
    if (readyMs <= now) {
      sceneStage = 'ready';
    } else {
      sceneStage = 'processing';
      sceneProgress = (now - startedMs) / Math.max(1, readyMs - startedMs);
    }
  }

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
      if (!res.ok) throw new Error(body.error ?? '排入生產失敗');
      setDesignId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '排入生產失敗');
    } finally {
      setLoading(false);
    }
  }

  async function handleCollect(batchId: number) {
    setError(null);
    setLoading(true);
    const target = batches.find((b) => b.id === batchId);
    const format = target ? machine.formats.find((f) => f.key === target.format_key) : undefined;
    setCollectFlourish({ name: format?.name ?? '', quantity: target?.quantity ?? 0 });
    setCollectOverride('collecting');
    try {
      const res = await fetch('/api/factory/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '收成失敗');
      setCollectOverride('shipped');
      router.refresh();
      setTimeout(() => setCollectOverride(null), 1500);
    } catch (err) {
      setCollectOverride(null);
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
          原料：{machine.materialName}（{machine.materialCost} 幣／份）・排隊 {batches.length}/{MAX_QUEUE_PER_MACHINE}
        </p>
      </div>

      <MachineScene
        machineKey={machine.key}
        stage={sceneStage}
        progress={sceneProgress}
        formatName={sceneFormatName}
        quantity={sceneQuantity}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      {batches.length > 0 && (
        <div className="flex flex-col gap-2">
          {batches.map((batch, index) => {
            // 佇列裡排在後面的批次，要等前一批的 ready_at 到了才算真的開始生產（見已定案項目31補充：
            // 排隊生產）。batches 依 ready_at 由小到大排序，且 ready_at 是累加算出來的，所以只要看
            // 前一項的 ready_at 有沒有到，就能判斷這一項是不是已經輪到它。
            const previous = batches[index - 1];
            const isActive = !previous || new Date(previous.ready_at).getTime() <= now;
            return (
              <QueueSlot
                key={batch.id}
                batch={batch}
                machine={machine}
                now={now}
                isActive={isActive}
                onCollect={handleCollect}
                loading={loading}
              />
            );
          })}
        </div>
      )}

      {queueFull ? (
        <p className="text-xs text-neutral-500">
          排隊已滿（最多同時排 {MAX_QUEUE_PER_MACHINE} 批），等前面收成後才能再排新的一批。
        </p>
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
                {format.name} {format.outputQuantity}件
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {designs.map((design) => (
              <DesignThumb
                key={design.id}
                design={design}
                onClick={() => setDesignId(design.id)}
                className={`aspect-square w-full cursor-pointer rounded border object-cover ${
                  design.id === designId ? 'border-neutral-900 ring-2 ring-neutral-900' : 'border-neutral-200'
                }`}
              />
            ))}
          </div>

          <p className="text-xs text-neutral-500">
            製作「{selectedFormat.name} × {selectedFormat.outputQuantity}」，花費 {machine.materialCost} 幣，共{' '}
            {selectedFormat.productionMinutes} 分鐘
          </p>

          <button
            type="button"
            disabled={loading}
            onClick={handleStart}
            className="self-start rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? '處理中…' : '製作'}
          </button>
        </div>
      )}
    </div>
  );
}
