import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findFormatByKey } from '@/lib/factory/catalog';
import { computeSlotRemaining, computeSlotSoldSoFar } from '@/lib/market/catalog';
import type { MarketShelfSlot } from '@/types/database';

// 收款（入帳）：結算「本日營業額」——玩家名下所有貨架、所有格子裡「已經賣掉但還沒入帳」的部分，
// 一次全部算進遊戲幣（見 PROJECT_PROGRESS.md 已定案項目 32）。這是「入帳」動作本身，
// 「結算」明細（賣了什麼、多少錢）由前端用同一批資料純算給玩家看，不需要另外呼叫 API 預覽。
//
// 併發安全（2026-08-01 補充）：每個 slot 的更新/刪除都額外加上
// `.eq('collected_quantity', slot.collected_quantity)` 當樂觀鎖條件——如果兩個請求幾乎同時
// 送出（例如兩個分頁都按了入帳），只有先寫入的那個請求能真的改到這筆資料（Postgres 單一
// UPDATE/DELETE 陳述式本身是原子操作），後到的請求會發現這筆已經被別人改過（影響 0 列），
// 這時就不能把這筆的營收算進 totalRevenue，避免同一筆賣出被算兩次入帳、生出遊戲幣。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: shelves } = await admin.from('market_shelves').select('id').eq('user_id', user.id);
  const shelfIds = (shelves ?? []).map((s) => s.id);
  if (shelfIds.length === 0) {
    return NextResponse.json({ ok: true, revenue: 0 });
  }

  const { data: slotsData } = await admin.from('market_shelf_slots').select('*').in('shelf_id', shelfIds);
  const slots = (slotsData ?? []) as MarketShelfSlot[];

  const now = Date.now();
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
        .from('market_shelf_slots')
        .delete()
        .eq('id', slot.id)
        .eq('collected_quantity', slot.collected_quantity)
        .select('id');
      if (deleted && deleted.length > 0) {
        totalRevenue += newlySold * format.sellPricePerUnit;
      }
    } else {
      const { data: updated } = await admin
        .from('market_shelf_slots')
        .update({ collected_quantity: soldSoFar })
        .eq('id', slot.id)
        .eq('collected_quantity', slot.collected_quantity)
        .select('id');
      if (updated && updated.length > 0) {
        totalRevenue += newlySold * format.sellPricePerUnit;
      }
    }
  }

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
