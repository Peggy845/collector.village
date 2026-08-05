'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MARKET_SELL_MINUTES_PER_UNIT, computeSlotRemaining, isSlotActive } from '@/lib/market/catalog';
import type { MarketFurnitureSlot } from '@/types/database';

// 自動上架模式（見 lib/market/restock.ts）開啟時，補貨要跟著「貨架真的少賣掉一件」的
// 時間點走，畫面才不會停在舊資料（見 Peggy 2026-08-02 實測回報）。
//
// 2026-08-02 改版（Peggy 指出原本的做法不夠精準）：原本是「每固定15秒重整一次」，缺點是
// 這個15秒是照目前「每分鐘賣1件」這個數字亂猜的一個夠短的間隔，以後賣出速度改成比較慢
// （例如5分鐘賣1件）還是固定15秒重整，變成大部分時間都在做白工。改成**精確算出所有貨架裡
// 「正在賣的那個 slot」下一次會少一件的確切時間點**（用 slot.active_from + 已經過幾個
// 賣出週期 * MARKET_SELL_MINUTES_PER_UNIT 算出來，不是用猜的），取所有貨架裡最早的一個，
// 排一個一次性的 setTimeout（不是 setInterval）在那個時間點才重整一次。重整之後拿到最新的
// slots，effect 會依新資料重新排下一次的時間點，形成「精準對準每次賣出事件」的鏈式排程，
// 不管賣出速度未來改成多快/多慢都不用調整這個元件。
export default function MarketAutoRefresh({
  enabled,
  slots,
  marketOpen,
}: {
  enabled: boolean;
  slots: MarketFurnitureSlot[];
  marketOpen: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    // 暫停營業時不會有任何東西被賣掉，沒有「下一次賣出」的時間點可以排程——重新營業本身
    // 是玩家主動點擊 MarketOpenToggle 觸發的 router.refresh()，屆時這個 effect 會自然重新執行。
    if (!enabled || !marketOpen) return;

    const now = Date.now();
    const unitMs = MARKET_SELL_MINUTES_PER_UNIT * 60 * 1000;

    let nextTick: number | null = null;
    for (const slot of slots) {
      if (!isSlotActive(slot, now) || computeSlotRemaining(slot, now) <= 0) continue;
      const activeFromMs = new Date(slot.active_from).getTime();
      const elapsedUnits = Math.floor((now - activeFromMs) / unitMs);
      const tickAt = activeFromMs + (elapsedUnits + 1) * unitMs;
      if (nextTick === null || tickAt < nextTick) {
        nextTick = tickAt;
      }
    }

    // 沒有任何貨架正在賣（例如剛買了貨架但還沒上架任何東西），不需要排程——
    // 上架/收成等操作本身已經會各自呼叫 router.refresh()，資料不會卡住。
    if (nextTick === null) return;

    // +1秒緩衝，確保伺服器那端的時鐘也確實跨過這個時間點，避免因為些微時間差提早重整、
    // 讀到「還沒少那一件」的資料，白跑一次還要再等下一輪。
    const delay = Math.max(0, nextTick - now) + 1000;
    const timer = setTimeout(() => router.refresh(), delay);
    return () => clearTimeout(timer);
  }, [enabled, marketOpen, slots, router]);

  return null;
}
