import { findFormatByKey } from '@/lib/factory/catalog';
import { computeSlotRemaining, isSlotActive, minutesUntilSoldOut } from '@/lib/market/catalog';
import type { FactoryDesign, MarketFurnitureSlot } from '@/types/database';
import DesignThumb from '@/components/factory/DesignThumb';

// 從 ShelfCard.tsx 抽出（2026-08-05，空間網格家具擺放系統），邏輯原封不動搬過來。
export default function SlotView({
  slot,
  now,
  onDelist,
  loading,
  designs,
  marketOpen,
}: {
  slot: MarketFurnitureSlot;
  now: number;
  onDelist: (id: number) => void;
  loading: boolean;
  designs: FactoryDesign[];
  marketOpen: boolean;
}) {
  const format = findFormatByKey(slot.format_key);
  const design = designs.find((d) => d.id === slot.design_id);
  const remaining = computeSlotRemaining(slot, now);
  const active = isSlotActive(slot, now);
  const minutesLeft = minutesUntilSoldOut(slot, now);

  // 已經賣完的格子不會顯示出來（見 idea/下架BUG.png：賣完的東西沒有東西可以「下架」，
  // 顯示一個帶下架按鈕的「已售完」列反而讓人誤以為還有實體庫存可以收回，家具該看起來是空的）。
  // 呼叫端已經把這種 slot 過濾掉不渲染，這裡不會走到 soldOut 分支，但保留這個分支邏輯以防萬一
  // （例如網路延遲時畫面暫時還沒收到最新資料）。
  const soldOut = active && remaining === 0;
  if (soldOut) return null;

  return (
    <div className="flex flex-col gap-1 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <div className="flex items-center gap-2">
        {design && (
          <DesignThumb design={design} className="h-10 w-10 shrink-0 rounded border border-neutral-200 object-cover" />
        )}
        {/* 只顯示品項名稱，不要在這裡重複標數量——原本這裡的「× slot.quantity」是上架當下的原始件數，
            賣掉之後仍然不變，跟下面「剩 X 件」放在一起會讓人誤以為還有兩種不同的數字（2026-08-01 修正）。 */}
        <p>{format?.name ?? slot.format_key}</p>
      </div>
      {!active ? (
        <p className="text-xs text-neutral-400">排隊中，等前面賣完才會開始賣（共 {slot.quantity} 件）</p>
      ) : (
        <p className="text-xs text-neutral-600">
          剩 {remaining} 件・約 {minutesLeft} 分鐘後售罄{!marketOpen && '（暫停營業中，倒數已凍結）'}
        </p>
      )}
      <button
        type="button"
        disabled={loading}
        onClick={() => onDelist(slot.id)}
        className="mt-1 self-start rounded border border-neutral-300 px-2 py-1 text-xs hover:border-neutral-500 disabled:opacity-50"
      >
        下架
      </button>
    </div>
  );
}
