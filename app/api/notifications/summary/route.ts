import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchMarketOpenState, fetchFurniture, fetchFurnitureSlots } from '@/lib/supabase/market';
import { computeSlotRemaining } from '@/lib/market/catalog';

// 給導覽列動態欄用的輕量提醒摘要（2026-08-01 依 Peggy 實測回饋簡化）：
// - readyBatches：幾批工廠生產已完成待收成。
// - furnitureNeedingRestock：有幾個家具「完全空的」（一件商品都沒有，不是還有空位就算）。
//   2026-08-01 修正：原本只要貨架還有剩餘空位就算，結果貨架上明明還在賣東西、只是沒放滿，
//   也會一直顯示提醒，等於變成一條永遠掛在畫面上的訊息，沒有意義（Peggy 實測抓到，見 idea/bug1.png）。
//   改成只有家具真的完全空著（一格都沒上架）才提醒，呼應「工廠倉庫空了才提醒生產」同一套判斷標準。
//   2026-08-05：純裝飾家具（收銀機，capacity===null）永遠排除在外，不然會被誤判成「空著待補貨」，
//   對純裝飾家具顯示這個提示沒有意義且會誤導玩家。
// - warehouseEmpty：工廠倉庫目前完全沒有庫存（東西都上架出去了），提醒該回工廠生產。
// 只回傳數字/布林值，不回傳明細，保持這支 API 很輕量（Header 會定期輪詢）。
// 用一般登入client（走RLS，只能讀自己的資料）即可，不需要service role。
//
// 刻意只做「頁面內顯示」，不用瀏覽器 Notification API、不改分頁標題、不改 favicon
// （見 PROJECT_PROGRESS.md 已定案項目 32：玩家可能在上班時間玩，提醒只能留在網頁畫面裡，
// 不能讓瀏覽器分頁外的地方（工作列、分頁標題）洩漏出「有新提醒」這件事）。
//
// 2026-08-02：這支 API 刻意不呼叫 autoRestockUser()。原本這裡也會觸發自動上架補貨，
// 跟 /market 頁面「開啟自動上架時每15秒 router.refresh()」是兩條獨立的觸發途徑，
// 兩者只要時間點重疊，就會同時各自讀到「還沒合併」的家具狀態、各自新增一列，
// 而不是合併成一列（見 idea/系統還沒更新.png：同款商品被拆成一長串各自1~2件的重複列，
// 這是 lib/market/listing.ts 的 upsertFurnitureSlot() 用「先讀最後一個slot、再決定合併或新增」
// 判斷，沒有鎖，兩個同時執行就會各自誤判成「還沒有可以合併的對象」）。修法是只留
// /market 頁面那一條觸發途徑（見 app/market/page.tsx、components/market/MarketAutoRefresh.tsx），
// 不要在這裡重複觸發，減少同時執行的機會。**這不是徹底解決競態問題**（例如玩家同時開兩個
// /market 分頁還是可能重現），但已知後果純粹是畫面上多幾列（不影響總數量、不影響遊戲幣正確性，
// 這些多出來的列會隨著各自賣完自然從畫面上消失），比照第31/32項對虛擬遊戲幣競態風險的既有
// 判斷（低風險、可接受，不值得為此導入額外的鎖機制），先不處理更完整的修法。
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ readyBatches: 0, furnitureNeedingRestock: 0, warehouseEmpty: false });
  }

  const [{ count: readyBatches }, { count: inventoryCount }, marketState, furniture, slots] = await Promise.all([
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
    fetchFurniture(supabase, user.id),
    fetchFurnitureSlots(supabase, user.id),
  ]);

  const now = marketState.open
    ? Date.now()
    : marketState.closedAt
      ? new Date(marketState.closedAt).getTime()
      : Date.now();

  const usedCapacityByFurniture = new Map<number, number>();
  for (const slot of slots) {
    usedCapacityByFurniture.set(
      slot.furniture_id,
      (usedCapacityByFurniture.get(slot.furniture_id) ?? 0) + computeSlotRemaining(slot, now)
    );
  }
  const furnitureNeedingRestock = furniture.filter(
    (item) => item.capacity !== null && (usedCapacityByFurniture.get(item.id) ?? 0) === 0
  ).length;

  return NextResponse.json({
    readyBatches: readyBatches ?? 0,
    furnitureNeedingRestock,
    warehouseEmpty: (inventoryCount ?? 0) === 0,
  });
}
