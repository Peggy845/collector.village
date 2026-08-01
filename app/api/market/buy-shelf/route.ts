import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCurrencyBalance } from '@/lib/supabase/currency';
import { DEFAULT_SHELF_CAPACITY, MARKET_SHELF_COST } from '@/lib/market/catalog';

// 買一個新貨架：扣幣、新增 market_shelves 列。跟工廠 API 一樣全部用 service role 執行，
// 一般角色沒有這幾張表的 insert 權限（見 supabase/schema.sql）。
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
  if (balance < MARKET_SHELF_COST) {
    return NextResponse.json(
      { error: `遊戲幣不足，買一個貨架需要 ${MARKET_SHELF_COST} 枚，目前只有 ${balance} 枚` },
      { status: 400 }
    );
  }

  const { error: shelfError } = await admin
    .from('market_shelves')
    .insert({ user_id: user.id, capacity: DEFAULT_SHELF_CAPACITY });
  if (shelfError) {
    return NextResponse.json({ error: '買貨架失敗，請稍後再試' }, { status: 500 });
  }

  const { error: ledgerError } = await admin.from('game_currency_ledger').insert({
    user_id: user.id,
    amount: -MARKET_SHELF_COST,
    reason: 'market_buy_shelf',
  });
  if (ledgerError) {
    console.error('market shelf ledger deduction failed after shelf insert', ledgerError);
  }

  return NextResponse.json({ ok: true });
}
