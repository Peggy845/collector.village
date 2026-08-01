'use client';

import { useEffect, useState } from 'react';
import type { MachineKey } from '@/types/database';

// 工廠美化動畫的「骨架」元件（2026-08-01，見 idea/開發日誌.md 同日條目）。
// 目的：先用純色塊/emoji 佔位把「待機→運作中→output→打包→運送」五段敘事的狀態切換邏輯搭好，
// Peggy 之後用 Gemini 生成美術素材（參考 idea/印表機1~5.png）後，只需要把下面 STAGE_ICON
// 換成 <img src="真的圖檔">，呼叫端（MachineCard）完全不用改，因為狀態判斷邏輯不在這個檔案裡。
export type MachineStage = 'idle' | 'processing' | 'ready' | 'collecting' | 'shipped';

const STAGE_LABEL: Record<MachineStage, string> = {
  idle: '待機中',
  processing: '運作中',
  ready: '已完成，等待收成',
  collecting: '打包中…',
  shipped: '已送往工廠倉庫',
};

// 每台機器在「待機／運作中／完成」三個階段各自的佔位圖示，呼應 idea/印表機1~5.png 的敘事
// （待機＝原料還沒動、運作中＝正在加工、完成＝成品長出來了）。打包／運送兩階段是四台機器共用的
// 通用動作，不需要每台機器分別設計。
const STAGE_ICON: Record<MachineKey, Record<'idle' | 'processing' | 'ready', string>> = {
  printer: { idle: '🧻', processing: '🖨️', ready: '📄' },
  sewing: { idle: '🧵', processing: '🪡', ready: '🧸' },
  press: { idle: '⚙️', processing: '🔨', ready: '🎖️' },
  laser: { idle: '💠', processing: '✨', ready: '🔷' },
};

const MACHINE_ACCENT: Record<MachineKey, string> = {
  printer: 'border-sky-200 bg-sky-50',
  sewing: 'border-rose-200 bg-rose-50',
  press: 'border-amber-200 bg-amber-50',
  laser: 'border-violet-200 bg-violet-50',
};

export default function MachineScene({
  machineKey,
  stage,
  progress = 0,
  formatName,
  quantity,
}: {
  machineKey: MachineKey;
  stage: MachineStage;
  /** 0~1，只在 processing 階段用來畫進度條，其餘階段忽略 */
  progress?: number;
  formatName?: string;
  quantity?: number;
}) {
  const icon =
    stage === 'idle' || stage === 'processing' || stage === 'ready'
      ? STAGE_ICON[machineKey][stage]
      : stage === 'collecting'
        ? '📦'
        : '🚚';

  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${MACHINE_ACCENT[machineKey]}`}>
      <span
        className={`text-3xl leading-none ${stage === 'idle' ? 'opacity-50 grayscale' : ''} ${
          stage === 'processing' ? 'animate-pulse' : ''
        } ${stage === 'ready' ? 'animate-bounce' : ''} ${stage === 'collecting' ? 'animate-spin' : ''}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs ${stage === 'ready' ? 'font-medium text-neutral-800' : 'text-neutral-600'}`}>
          {STAGE_LABEL[stage]}
          {formatName && quantity ? `・${formatName} × ${quantity}` : ''}
        </p>
        {stage === 'processing' && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
            <div
              className="h-full rounded-full bg-neutral-900 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
        )}
      </div>
      {stage === 'shipped' && <ShippedFadeOut />}
    </div>
  );
}

// 收成成功的瞬間短暫顯示，之後自己淡出——用 key 讓每次收成都重新掛載，
// 才能每次都從「不透明」重新開始淡出，不會因為前一次已經淡完而卡住。
function ShippedFadeOut() {
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFaded(true), 50);
    return () => clearTimeout(timer);
  }, []);
  return (
    <span
      className={`text-lg transition-opacity duration-[1200ms] ${faded ? 'opacity-0' : 'opacity-100'}`}
      aria-hidden
    >
      ✅
    </span>
  );
}
