import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchMarketOpenState, fetchShelves, fetchShelfSlots } from '@/lib/supabase/market';
import { computeSlotRemaining } from '@/lib/market/catalog';

// 給導覽列動態欄用的輕量提醒摘要（2026-08-01 依 Peggy 實測回饋簡化）：
// - readyBatches：幾批工廠生產已完成待收成。
// - shelvesNeedingRestock：有幾個貨架「完全空的」（一件商品都沒有，不是還有空位就算）。
//   2026-08-01 修正：原本只要貨架還有剩餘空位就算，結果貨架上明明還在賣東西、只是沒放滿，
//   也會一直顯示提醒，等於變成一條永遠掛在畫面上的訊息，沒有意義（Peggy 實測抓到，見 idea/bug1.png）。
//   改成只有貨架真的完全空著（一格都沒上架）才提醒，呼應「工廠倉庫空了才提醒生產」同一套判斷標準。
// - warehouseEmpty：工廠倉庫目前完全沒有庫存（東西都上架出去了），提醒該回工廠生產。
// 只回傳數字/布林值，不回傳明細，保持這支 API 很輕量（Header 會定期輪詢）。
// 用一般登入client（走RLS，只能讀自己的資料）即可，不需要service role。
//
// 刻意只做「頁面內顯示」，不用瀏覽器 Notification API、不改分頁標題、不改 favicon
// （見 PROJECT_PROGRESS.md 已定案項目 32：玩家可能在上班時間玩，提醒只能留在網頁畫面裡，
// 不能讓瀏覽器分頁外的地方（工作列、分頁標題）洩漏出「有新提醒」這件事）。
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ readyBatches: 0, shelvesNeedingRestock: 0, warehouseEmpty: false });
  }

  const [{ count: readyBatches }, { count: inventoryCount }, marketState, shelves, slots] = await Promise.all([
    supabase
      .from('factory_production_batches')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .lte('ready_at', new Date().toISOString()),
    supabase
      .from('factory_inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gt('quantity', 0),
    fetchMarketOpenState(supabase, user.id),
    fetchShelves(supabase, user.id),
    fetchShelfSlots(supabase, user.id),
  ]);

  const now = marketState.open
    ? Date.now()
    : marketState.closedAt
      ? new Date(marketState.closedAt).getTime()
      : Date.now();

  const usedCapacityByShelf = new Map<number, number>();
  for (const slot of slots) {
    usedCapacityByShelf.set(
      slot.shelf_id,
      (usedCapacityByShelf.get(slot.shelf_id) ?? 0) + computeSlotRemaining(slot, now)
    );
  }
  const shelvesNeedingRestock = shelves.filter((shelf) => (usedCapacityByShelf.get(shelf.id) ?? 0) === 0).length;

  return NextResponse.json({
    readyBatches: readyBatches ?? 0,
    shelvesNeedingRestock,
    warehouseEmpty: (inventoryCount ?? 0) === 0,
  });
}
