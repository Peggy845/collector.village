import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { autoRestockUser } from '@/lib/market/restock';

// 切換「手動上架／自動上架」（見 PROJECT_PROGRESS.md 已定案項目 32 補充、lib/market/restock.ts）。
// 開啟自動上架的當下就立刻跑一次補貨，不用等下一次頁面載入或導覽列輪詢。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from('users')
    .select('market_auto_restock')
    .eq('id', user.id)
    .maybeSingle();
  const nextValue = !(userRow?.market_auto_restock ?? false);

  const { error } = await admin.from('users').update({ market_auto_restock: nextValue }).eq('id', user.id);
  if (error) {
    return NextResponse.json({ error: '切換失敗，請稍後再試' }, { status: 500 });
  }

  if (nextValue) {
    await autoRestockUser(admin, user.id);
  }

  return NextResponse.json({ ok: true, autoRestock: nextValue });
}
