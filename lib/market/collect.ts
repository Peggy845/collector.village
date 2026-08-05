import type { SupabaseClient } from '@supabase/supabase-js';
import { findFormatByKey } from '@/lib/factory/catalog';
import { computeSlotRemaining, computeSlotSoldSoFar } from './catalog';
import type { MarketFurnitureSlot } from '@/types/database';

// 收款（入帳）核心邏輯，從 app/api/market/collect/route.ts 抽出來方便寫單元測試
// （見 lib/market/collect.test.ts）——路由只負責認證跟把回傳的營收寫進遊戲幣帳本，
// 行為跟原本完全一致，只是把邏輯搬到這裡。
//
// 併發安全：每個 slot 的更新/刪除都額外加上 `.eq('collected_quantity', slot.collected_quantity)`
// 當樂觀鎖條件，讀取後、寫入前如果被別的請求搶先改過，這裡會安全地不把那筆算進營收，
// 不會重複入帳（見下方測試「模擬併發搶輸」案例）。
export async function collectMarketRevenue(
  admin: SupabaseClient,
  userId: string,
  now: number = Date.now()
): Promise<number> {
  const { data: furniture } = await admin.from('market_furniture').select('id').eq('user_id', userId);
  const furnitureIds = ((furniture ?? []) as { id: number }[]).map((f) => f.id);
  if (furnitureIds.length === 0) return 0;

  const { data: slotsData } = await admin
    .from('market_furniture_slots')
    .select('*')
    .in('furniture_id', furnitureIds);
  const slots = (slotsData ?? []) as MarketFurnitureSlot[];

  let totalRevenue = 0;

  for (const slot of slots) {
    const format = findFormatByKey(slot.format_key);
    if (!format) continue;

    const remaining = computeSlotRemaining(slot, now);
    const soldSoFar = computeSlotSoldSoFar(slot, now);
    const newlySold = soldSoFar - slot.collected_quantity;
    if (newlySold <= 0) continue;

    if (remaining === 0) {
      const { data: deleted } = await admin
        .from('market_furniture_slots')
        .delete()
        .eq('id', slot.id)
        .eq('collected_quantity', slot.collected_quantity)
        .select('id');
      if (deleted && deleted.length > 0) {
        totalRevenue += newlySold * format.sellPricePerUnit;
      }
    } else {
      const { data: updated } = await admin
        .from('market_furniture_slots')
        .update({ collected_quantity: soldSoFar })
        .eq('id', slot.id)
        .eq('collected_quantity', slot.collected_quantity)
        .select('id');
      if (updated && updated.length > 0) {
        totalRevenue += newlySold * format.sellPricePerUnit;
      }
    }
  }

  return totalRevenue;
}
