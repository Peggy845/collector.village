import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { collectMarketRevenue } from '@/lib/market/collect';

// 收款（入帳）：結算「本日營業額」——玩家名下所有貨架、所有格子裡「已經賣掉但還沒入帳」的部分，
// 一次全部算進遊戲幣（見 PROJECT_PROGRESS.md 已定案項目 32）。這是「入帳」動作本身，
// 「結算」明細（賣了什麼、多少錢）由前端用同一批資料純算給玩家看，不需要另外呼叫 API 預覽。
// 實際計算跟併發安全（樂觀鎖）邏輯在 lib/market/collect.ts，抽出來方便寫單元測試。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const admin = createAdminClient();
  const totalRevenue = await collectMarketRevenue(admin, user.id);

  if (totalRevenue > 0) {
    const { error: ledgerError } = await admin.from('game_currency_ledger').insert({
      user_id: user.id,
      amount: totalRevenue,
      reason: 'market_collect',
    });
    if (ledgerError) {
      return NextResponse.json({ error: '入帳失敗，請稍後再試' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, revenue: totalRevenue });
}
