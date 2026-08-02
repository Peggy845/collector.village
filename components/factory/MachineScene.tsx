'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { MachineKey } from '@/types/database';

// 工廠美化動畫（2026-08-02 依 idea/印表機簡單版.png 改版，取代原本的五段式敘事骨架）。
// Peggy 確認參考影片等級的3D建築動畫太細，改用更簡單的模型：
//   - 建築本體是 Gemini 生成的靜態小鎮風格插畫，永遠不變（不做多階段圖）。
//   - 疊加兩個小圖示，只有這兩個會變化：
//     A（煙囪位置，右上角）：有批次正在倒數生產中＝冒煙，沒有（含排隊中/已完成待收成）＝Zzz睡覺符號。
//     B（出貨口位置，右下角）：佇列裡有沒有「已完成、還沒按收成」的批次＝一堆貨，沒有＝空白
//       （2026-08-02 改成看佇列而非工廠倉庫庫存，見 idea/圖示不對.png：原本看倉庫庫存時，
//       玩家會看到序列明明是空的卻出現貨堆，因為倉庫裡還留著很久以前收成、還沒拿去超市上架的舊庫存）。
// 建築圖跟三個疊加圖示是 Peggy 依 idea/gemini-工廠美術prompt.md 用 Gemini 生成、存在
// public/factory/ 底下的透明背景PNG（2026-08-02 換上，取代原本的 emoji 佔位）。
const BUILDING_IMAGE: Record<MachineKey, string> = {
  printer: '/factory/printer.png',
  sewing: '/factory/sewing.png',
  press: '/factory/press.png',
  laser: '/factory/laser.png',
};

const BUILDING_ACCENT: Record<MachineKey, string> = {
  printer: 'border-sky-200 bg-sky-50',
  sewing: 'border-rose-200 bg-rose-50',
  press: 'border-amber-200 bg-amber-50',
  laser: 'border-violet-200 bg-violet-50',
};

export default function MachineScene({
  machineKey,
  producing,
  hasReadyBatch,
  justCollected,
}: {
  machineKey: MachineKey;
  /** 有批次正在倒數生產中（決定煙囪冒煙還是Zzz） */
  producing: boolean;
  /** 佇列裡有沒有已完成、還沒按收成的批次（決定出貨口那格有沒有貨） */
  hasReadyBatch: boolean;
  /** 剛按下收成的短暫提示，跟 hasReadyBatch 無關，純粹給玩家一個「有收到」的反饋 */
  justCollected?: boolean;
}) {
  return (
    <div
      className={`relative flex h-28 items-center justify-center overflow-visible rounded-lg border ${BUILDING_ACCENT[machineKey]}`}
    >
      {/* 建築本體 */}
      <div className="relative h-24 w-44">
        <Image src={BUILDING_IMAGE[machineKey]} alt="" fill className="object-contain" sizes="176px" />
      </div>

      {/* A：煙囪位置 */}
      <span
        className="absolute right-2 top-1 block h-7 w-7"
        aria-label={producing ? '生產中' : '待機中'}
        title={producing ? '生產中' : '待機中'}
      >
        <span className={`relative block h-full w-full ${producing ? 'animate-pulse' : 'opacity-70'}`}>
          <Image
            src={producing ? '/factory/icon-smoke.png' : '/factory/icon-sleep.png'}
            alt=""
            fill
            className="object-contain"
            sizes="28px"
          />
        </span>
      </span>

      {/* B：出貨口位置，有已完成待收成的批次才顯示 */}
      {hasReadyBatch && (
        <span
          className="absolute bottom-1 right-2 block h-7 w-7"
          aria-label="有完成的批次等待收成"
          title="有完成的批次等待收成"
        >
          <Image src="/factory/icon-boxes.png" alt="" fill className="object-contain" sizes="28px" />
        </span>
      )}

      {justCollected && <CollectedFlourish />}
    </div>
  );
}

// 收成成功的瞬間短暫顯示，之後自己淡出——用 key 讓每次收成都重新掛載，
// 才能每次都從「不透明」重新開始淡出，不會因為前一次已經淡完而卡住。
function CollectedFlourish() {
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFaded(true), 50);
    return () => clearTimeout(timer);
  }, []);
  return (
    <span
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl transition-opacity duration-[1200ms] ${
        faded ? 'opacity-0' : 'opacity-100'
      }`}
      aria-hidden
    >
      ✅
    </span>
  );
}
