'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_QUEUE_PER_MACHINE, type FactoryMachine } from '@/lib/factory/catalog';
import type { FactoryDesign, FactoryProductionBatch } from '@/types/database';
import Countdown from './Countdown';
import DesignThumb from './DesignThumb';
import MachineScene from './MachineScene';

function QueueSlot({
  batch,
  machine,
  design,
  now,
  isActive,
  onCollect,
  loading,
}: {
  batch: FactoryProductionBatch;
  machine: FactoryMachine;
  design: FactoryDesign | undefined;
  now: number;
  isActive: boolean;
  onCollect: (batchId: number) => void;
  loading: boolean;
}) {
  const isReady = isActive && new Date(batch.ready_at).getTime() <= now;
  const format = machine.formats.find((f) => f.key === batch.format_key);

  return (
    <div className="flex items-center gap-3 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
      {design && <DesignThumb design={design} className="h-10 w-10 shrink-0 rounded border border-neutral-200 object-cover" />}
      <div className="flex flex-1 flex-col gap-2">
        <p>
          {design?.name ?? '設計圖'}・{format?.name} × {batch.quantity}
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
    </div>
  );
}

export default function MachineCard({
  machine,
  designs,
  batches,
  initialDesignId,
}: {
  machine: FactoryMachine;
  designs: FactoryDesign[];
  batches: FactoryProductionBatch[];
  /** 從設計坊「直接生產」帶過來的預選設計圖 id（見 app/factory/page.tsx 的 ?designId= 參數） */
  initialDesignId?: number | null;
}) {
  const router = useRouter();
  const [formatKey, setFormatKey] = useState(machine.formats[0].key);
  const [designId, setDesignId] = useState<number | null>(initialDesignId ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [designFilter, setDesignFilter] = useState('');
  // 收成成功的短暫「✅」提示，跟 hasReadyBatch 是否為 true 無關，純粹是給玩家的即時反饋，
  // 用 timeout 自己收尾，不用綁定被收成的那筆批次是否還存在於 batches。
  const [justCollected, setJustCollected] = useState(false);

  const selectedFormat = machine.formats.find((f) => f.key === formatKey)!;
  const queueFull = batches.length >= MAX_QUEUE_PER_MACHINE;

  // 見 idea/印表機簡單版.png 定案的簡化版工廠視覺：建築本體不變，只有「有沒有在冒煙」跟
  // 「出貨口有沒有貨」兩個小圖示會變化，不做完整的五階段敘事動畫。
  //
  // 2026-08-02 修正：原本只看 batches[0]（佇列裡 ready_at 最早的那批）判斷有沒有在冒煙，
  // 但 batches[0] 完成後（ready_at<=now）如果玩家還沒按收成，它會繼續留在佇列最前面，
  // 這時候真正在跑的其實是「輪到它、但還沒到 ready_at」的那一批（見 idea/圖示不對.png：
  // 壓模機第一批已完成待收成、第二批其實正在倒數0:34，卻顯示Zzz）。batches 依 ready_at
  // 由小到大排序、且是接續排程（每批的開始時間＝前一批的 ready_at），所以「還沒到 ready_at
  // 的那些批次」裡最早的一個，必然就是目前真正在跑的那一批——用 some() 判斷佇列裡有沒有
  // 任何一批還沒到 ready_at 即可，不需要另外判斷是不是輪到它。
  const producing = batches.some((b) => new Date(b.ready_at).getTime() > now);
  // 出貨口圖示（2026-08-02 依 Peggy 回報改成看佇列，不看工廠倉庫庫存）：原本用「工廠倉庫裡這台
  // 機器的成品庫存 > 0」判斷，但玩家看到的是「生產序列裡明明沒有東西」卻出現貨堆圖示，
  // 因為倉庫庫存包含很久以前收成、還沒拿去超市上架的舊庫存，跟畫面上的生產序列脫鉤，容易誤會。
  // 改成只看「佇列裡有沒有已完成、還沒按收成的批次」，跟畫面上會不會出現「收成」按鈕完全一致。
  const hasReadyBatch = batches.some((b) => new Date(b.ready_at).getTime() <= now);

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
    try {
      const res = await fetch('/api/factory/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '收成失敗');
      setJustCollected(true);
      router.refresh();
      setTimeout(() => setJustCollected(false), 1500);
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
          原料：{machine.materialName}（{machine.materialCost} 幣／份）・排隊 {batches.length}/{MAX_QUEUE_PER_MACHINE}
        </p>
      </div>

      <MachineScene
        machineKey={machine.key}
        producing={producing}
        hasReadyBatch={hasReadyBatch}
        justCollected={justCollected}
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
            const design = designs.find((d) => d.id === batch.design_id);
            return (
              <QueueSlot
                key={batch.id}
                batch={batch}
                machine={machine}
                design={design}
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

          {designs.length > 8 && (
            <input
              type="text"
              value={designFilter}
              onChange={(e) => setDesignFilter(e.target.value)}
              placeholder="搜尋設計圖名稱…"
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            />
          )}

          {(() => {
            const keyword = designFilter.trim().toLowerCase();
            const filtered = keyword
              ? designs.filter((d) => (d.name ?? '').toLowerCase().includes(keyword))
              : designs;
            const officialDesigns = filtered.filter((d) => d.user_id == null);
            const ownDesigns = filtered.filter((d) => d.user_id != null);

            function designGrid(list: FactoryDesign[]) {
              return (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {list.map((design) => (
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
              );
            }

            if (filtered.length === 0) {
              return <p className="text-xs text-neutral-400">找不到符合「{designFilter}」的設計圖。</p>;
            }

            // 官方圖庫/我的設計分開一組（見 2026-08-03 討論：設計坊上線後設計會變多，混在一起
            // 平鋪很難找），只有兩邊都有東西時才需要各自標題，否則直接顯示單一組不加多餘標題。
            if (officialDesigns.length > 0 && ownDesigns.length > 0) {
              return (
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="mb-1 text-xs text-neutral-500">官方圖庫</p>
                    {designGrid(officialDesigns)}
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-neutral-500">我的設計</p>
                    {designGrid(ownDesigns)}
                  </div>
                </div>
              );
            }
            return designGrid(filtered);
          })()}

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
