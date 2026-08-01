// 開發測試用：清空指定帳號的貨架上架資料跟工廠倉庫庫存，讓超市/工廠回到乾淨狀態重新測試
// （見 PROJECT_PROGRESS.md 第10-1項測試策略：作弊/清理能力只存在於本機腳本）。
// 用法：node --env-file=.env.local scripts/dev-reset-market-warehouse.mjs <email或user_id>
//
// 清空前會先把「本日營業額」（已賣出但還沒按收款的部分）比照 /api/market/collect 的邏輯
// 結算入帳，不會平白讓玩家已經賺到的遊戲幣消失；接著才刪除所有 market_shelf_slots
// （貨架本身保留，只清空上面的商品）跟 factory_inventory_items（工廠倉庫庫存）。
// 不會動到工廠生產佇列（factory_production_batches）或遊戲幣帳本歷史紀錄。

import { createClient } from '@supabase/supabase-js';

const [, , idOrEmail] = process.argv;

if (!idOrEmail) {
  console.error('用法：node --env-file=.env.local scripts/dev-reset-market-warehouse.mjs <email或user_id>');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，請確認 .env.local 並用 --env-file 執行。');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MARKET_SELL_MINUTES_PER_UNIT = 1;

// 售價表照抄 lib/factory/catalog.ts（.mjs 腳本沒有 TS loader，無法直接 import 該檔案，
// 只在這個一次性清理腳本裡複製一份用於估算已賣出金額，不是給正式程式碼用的來源）。
const FORMAT_SELL_PRICE = {
  poster: 25,
  postcard: 10,
  card: 5,
  sticker: 4,
  plush: 40,
  plush_outfit: 80,
  badge: 16,
  keychain: 24,
  acrylic_stand: 125,
  acrylic_charm: 25,
};

function computeSlotRemaining(slot, now) {
  const activeFromMs = new Date(slot.active_from).getTime();
  if (now <= activeFromMs) return slot.quantity;
  const elapsedUnits = Math.floor((now - activeFromMs) / (MARKET_SELL_MINUTES_PER_UNIT * 60 * 1000));
  return Math.max(0, slot.quantity - elapsedUnits);
}

async function resolveUserId(idOrEmail) {
  if (idOrEmail.includes('@')) {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    const user = data.users.find((u) => u.email === idOrEmail);
    if (!user) throw new Error(`找不到 email 為 ${idOrEmail} 的使用者`);
    return user.id;
  }
  return idOrEmail;
}

async function main() {
  const userId = await resolveUserId(idOrEmail);

  const { data: shelves, error: shelvesError } = await supabase
    .from('market_shelves')
    .select('id')
    .eq('user_id', userId);
  if (shelvesError) throw shelvesError;
  const shelfIds = (shelves ?? []).map((s) => s.id);

  if (shelfIds.length > 0) {
    const { data: slots, error: slotsError } = await supabase
      .from('market_shelf_slots')
      .select('*')
      .in('shelf_id', shelfIds);
    if (slotsError) throw slotsError;

    const now = Date.now();
    let totalRevenue = 0;
    for (const slot of slots ?? []) {
      const soldSoFar = slot.quantity - computeSlotRemaining(slot, now);
      const newlySold = soldSoFar - slot.collected_quantity;
      if (newlySold <= 0) continue;
      const price = FORMAT_SELL_PRICE[slot.format_key] ?? 0;
      totalRevenue += newlySold * price;
    }

    if (totalRevenue > 0) {
      const { error: ledgerError } = await supabase
        .from('game_currency_ledger')
        .insert({ user_id: userId, amount: totalRevenue, reason: 'dev_reset_market_warehouse:auto_collect' });
      if (ledgerError) throw ledgerError;
      console.log(`已先結算入帳 ${totalRevenue} 枚遊戲幣（清空前的已賣出未收款部分）`);
    } else {
      console.log('沒有已賣出未收款的部分，不用先結算。');
    }

    const { error: deleteSlotsError } = await supabase.from('market_shelf_slots').delete().in('shelf_id', shelfIds);
    if (deleteSlotsError) throw deleteSlotsError;
    console.log(`已清空 ${shelfIds.length} 個貨架上的所有上架項目`);
  } else {
    console.log('這個帳號目前沒有任何貨架，跳過清空貨架這一步。');
  }

  const { error: deleteInventoryError } = await supabase
    .from('factory_inventory_items')
    .delete()
    .eq('user_id', userId);
  if (deleteInventoryError) throw deleteInventoryError;
  console.log('已清空工廠倉庫庫存');
}

main().catch((err) => {
  console.error('執行過程發生錯誤：', err);
  process.exit(1);
});
