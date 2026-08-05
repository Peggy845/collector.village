'use client';

import { FURNITURE_CATALOG } from '@/lib/market/furniture';
import type { FurnitureType } from '@/types/database';

// 家具選擇按鈕（取代舊版 BuyShelfButton.tsx）：選了種類之後由呼叫端（MarketGrid）進入
// 「放置模式」，等玩家點擊網格上的空格才真的送出購買請求（見 app/api/market/buy-furniture）。
// 2026-08-05（空間網格家具擺放系統）：不再顯示/檢查任何「已達上限」文字——家具數量上限
// （原本的 MAX_SHELVES）已經拿掉，改由放置規則（場地放不放得下）自然限制。
export default function FurniturePicker({
  balance,
  disabled,
  onPick,
}: {
  balance: number;
  disabled: boolean;
  onPick: (type: FurnitureType) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FURNITURE_CATALOG.map((def) => (
        <button
          key={def.type}
          type="button"
          disabled={disabled || balance < def.cost}
          onClick={() => onPick(def.type)}
          className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:border-neutral-500 disabled:opacity-50"
        >
          {def.name}（{def.cost} 幣）
        </button>
      ))}
    </div>
  );
}
