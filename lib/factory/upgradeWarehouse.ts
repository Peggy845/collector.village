import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCurrencyBalance } from '@/lib/supabase/currency';
import { fetchWarehouseCapacity } from '@/lib/supabase/market';
import { WAREHOUSE_UPGRADE_AMOUNT, WAREHOUSE_UPGRADE_COST } from '@/lib/market/catalog';

// 升級工廠倉庫容量上限的核心邏輯，從 app/api/factory/upgrade-warehouse/route.ts 抽出來
// 方便寫單元測試（見 lib/factory/upgradeWarehouse.test.ts），比照
// lib/factory/startProduction.ts 同樣的 { ok: true } | { ok: false; error; status } 回傳型別。
export type UpgradeWarehouseResult = { ok: true; newCapacity: number } | { ok: false; error: string; status: number };

export async function upgradeWarehouse(admin: SupabaseClient, userId: string): Promise<UpgradeWarehouseResult> {
  const balance = await fetchCurrencyBalance(admin, userId);
  if (balance < WAREHOUSE_UPGRADE_COST) {
    return {
      ok: false,
      error: `遊戲幣不足，升級倉庫需要 ${WAREHOUSE_UPGRADE_COST} 枚，目前只有 ${balance} 枚`,
      status: 400,
    };
  }

  const currentCapacity = await fetchWarehouseCapacity(admin, userId);
  const newCapacity = currentCapacity + WAREHOUSE_UPGRADE_AMOUNT;
  const { error: updateError } = await admin.from('users').update({ warehouse_capacity: newCapacity }).eq('id', userId);
  if (updateError) {
    return { ok: false, error: '升級失敗，請稍後再試', status: 500 };
  }

  const { error: ledgerError } = await admin.from('game_currency_ledger').insert({
    user_id: userId,
    amount: -WAREHOUSE_UPGRADE_COST,
    reason: 'factory_upgrade_warehouse',
  });
  if (ledgerError) {
    console.error('warehouse upgrade ledger deduction failed after capacity update', ledgerError);
  }

  return { ok: true, newCapacity };
}
