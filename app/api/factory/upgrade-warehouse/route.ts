import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCurrencyBalance } from '@/lib/supabase/currency';
import { fetchWarehouseCapacity } from '@/lib/supabase/market';
import { WAREHOUSE_UPGRADE_AMOUNT, WAREHOUSE_UPGRADE_COST } from '@/lib/market/catalog';

// 升級工廠倉庫容量上限（見 PROJECT_PROGRESS.md 已定案項目 32：倉庫容量上限＋付費升級，
// 是促成「工廠↔超市」資源循環的關鍵機制）。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const admin = createAdminClient();

  const balance = await fetchCurrencyBalance(admin, user.id);
  if (balance < WAREHOUSE_UPGRADE_COST) {
    return NextResponse.json(
      { error: `遊戲幣不足，升級倉庫需要 ${WAREHOUSE_UPGRADE_COST} 枚，目前只有 ${balance} 枚` },
      { status: 400 }
    );
  }

  const currentCapacity = await fetchWarehouseCapacity(admin, user.id);
  const { error: updateError } = await admin
    .from('users')
    .update({ warehouse_capacity: currentCapacity + WAREHOUSE_UPGRADE_AMOUNT })
    .eq('id', user.id);
  if (updateError) {
    return NextResponse.json({ error: '升級失敗，請稍後再試' }, { status: 500 });
  }

  const { error: ledgerError } = await admin.from('game_currency_ledger').insert({
    user_id: user.id,
    amount: -WAREHOUSE_UPGRADE_COST,
    reason: 'factory_upgrade_warehouse',
  });
  if (ledgerError) {
    console.error('warehouse upgrade ledger deduction failed after capacity update', ledgerError);
  }

  return NextResponse.json({ ok: true, newCapacity: currentCapacity + WAREHOUSE_UPGRADE_AMOUNT });
}
