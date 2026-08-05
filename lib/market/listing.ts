import type { SupabaseClient } from '@supabase/supabase-js';
import { computeSlotRemaining } from './catalog';
import type { MarketFurnitureSlot } from '@/types/database';

// 把商品放上家具的共用底層寫入邏輯（見 idea/排序太長.png 定案的優化，2026-08-02）：
// `/api/market/list`（手動上架單一品項、也是 FurnitureDetailPanel「自動上架」按鈕依序呼叫的同一支API）
// 跟 `lib/market/restock.ts`（自動上架模式被動補貨）都呼叫這個函式，確保上架的寫入邏輯只有一份。
//
// 背景：自動上架模式每次補貨都是小量（例如家具每分鐘賣掉1件、空出1件空位就補1件），
// 如果每次都新增一個 slot，同一款商品排隊中的 slot 會變成一長串「同款商品 × 1」的重複列，
// 排隊清單很快就長到看不下去。改成：檢查家具目前排在最後面的那個 slot（不論正在賣還是排隊中）
// 是不是剛好跟這次要上架的品項（同格式+同設計圖）一樣，是的話直接把數量累加上去，不新增一列；
// 只有最後一個 slot 是不同品項（或家具本來還沒有任何 slot）時，才真的新增一列接在後面。
// 因為只跟「最後一個」slot 合併，合併時只需要改它自己的 quantity（它的 active_from 不用動，
// 賣完時間自然因為 quantity 變大而順延），後面沒有其他 slot 需要跟著調整。
//
// 呼叫端負責先確認這次要上架的格式跟目標家具相容、數量沒有超過家具剩餘空位，
// 這裡只負責實際寫入資料庫。
export async function upsertFurnitureSlot(
  admin: SupabaseClient,
  params: { furnitureId: number; formatKey: string; designId: number; quantity: number; now: number }
): Promise<{ error?: string }> {
  const { furnitureId, formatKey, designId, quantity, now } = params;

  const { data: existingSlots, error: fetchError } = await admin
    .from('market_furniture_slots')
    .select('*')
    .eq('furniture_id', furnitureId);
  if (fetchError) {
    return { error: '上架失敗，請稍後再試' };
  }
  const slots = (existingSlots ?? []) as MarketFurnitureSlot[];

  // 找「排在最後面」的那個 slot 時，只考慮還有剩餘可賣的（見 2026-08-02 依 idea/又出現.png
  // 追查發現的根因）：已經完全賣光、只是還沒被玩家按「收款」清掉的舊 slot（見
  // app/api/market/collect/route.ts，賣完才會在收款時被刪除）絕對不能被選中——不然新庫存
  // 會被合併進一個「早就賣完」的死格子，因為它的 active_from 是很久以前，用 quantity 減掉
  // 已經過的賣出週期算出來的剩餘直接被吃成 0，等於這批新庫存被默默吞掉，玩家永遠賣不到。
  const liveSlots = slots.filter((s) => computeSlotRemaining(s, now) > 0);

  // 找「結束時間最晚」的當成隊伍尾端。同一個家具的排程理論上只會有單一一條隊伍，
  // 但如果曾經因為底下這個判斷出過差錯，兩個不同商品的 slot 可能剛好算出一模一樣的
  // 結束時間（尤其量都是1分鐘賣1件的整數分鐘，湊整並不罕見）——這種情況下改成比較
  // 「誰是比較晚才被建立的」來判斷真正的隊伍尾端，不能只看誰先出現在查詢結果裡，
  // 不然會認錯尾端，讓新補的庫存接到錯的分支上、讓隊伍整個分岔（見 idea/又出現.png：
  // 兩個不同商品都被判斷成「隊伍尾端」，之後的補貨各自接在不同分支後面，變成看起來
  // 好幾樣東西都「快排到」，而不是照順序一條隊伍排下去）。
  let tail: MarketFurnitureSlot | null = null;
  let latestFinish = 0;
  for (const slot of liveSlots) {
    const finish = new Date(slot.active_from).getTime() + slot.quantity * 60 * 1000;
    const isNewTail =
      finish > latestFinish ||
      (finish === latestFinish &&
        tail !== null &&
        new Date(slot.listed_at).getTime() > new Date(tail.listed_at).getTime());
    if (isNewTail) {
      latestFinish = finish;
      tail = slot;
    }
  }

  if (tail && tail.format_key === formatKey && tail.design_id === designId) {
    // 樂觀鎖：合併寫入前多帶一個「quantity 沒有被別人改過」的條件，如果這筆資料在讀取之後、
    // 寫入之前被別的請求搶先改掉，這次更新會影響 0 列——這時候改成安全地走下面新增一列的路徑，
    // 不會覆蓋掉別人剛寫入的東西（比照 app/api/market/collect 既有的併發安全做法）。
    const { data: updated, error } = await admin
      .from('market_furniture_slots')
      .update({ quantity: tail.quantity + quantity })
      .eq('id', tail.id)
      .eq('quantity', tail.quantity)
      .select('id');
    if (error) {
      return { error: '上架失敗，請稍後再試' };
    }
    if (updated && updated.length > 0) {
      return {};
    }
    // 沒搶到樂觀鎖，往下走新增一列的路徑（不直接視為失敗）。
  }

  const activeFrom = new Date(Math.max(now, latestFinish)).toISOString();
  const { error } = await admin.from('market_furniture_slots').insert({
    furniture_id: furnitureId,
    format_key: formatKey,
    design_id: designId,
    quantity,
    active_from: activeFrom,
  });
  if (error) {
    return { error: '上架失敗，請稍後再試' };
  }
  return {};
}
