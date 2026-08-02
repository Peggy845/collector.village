import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findFormatByKey } from '@/lib/factory/catalog';
import { computeSlotRemaining, computeSlotSoldSoFar, computeTimeSavedOnEarlyDelist } from '@/lib/market/catalog';
import type { MarketShelfSlot } from '@/types/database';

// 下架：把貨架上還沒賣完的數量收回工廠倉庫。下架前先把「已經賣掉但還沒按收款」的部分結算入帳，
// 不會因為下架而讓玩家平白損失已經賣出的錢（見 PROJECT_PROGRESS.md 已定案項目 32）。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const slotId = Number(body?.slotId);
  if (!slotId) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: slot } = await admin
    .from('market_shelf_slots')
    .select('*, market_shelves!inner(user_id)')
    .eq('id', slotId)
    .eq('market_shelves.user_id', user.id)
    .maybeSingle();
  if (!slot) {
    return NextResponse.json({ error: '找不到這個上架項目' }, { status: 400 });
  }
  const typedSlot = slot as MarketShelfSlot & { market_shelves: { user_id: string } };

  const format = findFormatByKey(typedSlot.format_key);
  if (!format) {
    return NextResponse.json({ error: '找不到對應的商品格式' }, { status: 500 });
  }

  const now = Date.now();
  const remaining = computeSlotRemaining(typedSlot, now);
  const soldSoFar = computeSlotSoldSoFar(typedSlot, now);
  const uncollectedSold = soldSoFar - typedSlot.collected_quantity;

  if (uncollectedSold > 0) {
    const { error: ledgerError } = await admin.from('game_currency_ledger').insert({
      user_id: user.id,
      amount: uncollectedSold * format.sellPricePerUnit,
      reason: `market_delist_settle:slot=${slotId}`,
    });
    if (ledgerError) {
      return NextResponse.json({ error: '結算失敗，請稍後再試' }, { status: 500 });
    }
  }

  if (remaining > 0) {
    const { data: existing } = await admin
      .from('factory_inventory_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('format_key', typedSlot.format_key)
      .eq('design_id', typedSlot.design_id)
      .maybeSingle();

    if (existing) {
      await admin
        .from('factory_inventory_items')
        .update({ quantity: existing.quantity + remaining, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await admin.from('factory_inventory_items').insert({
        user_id: user.id,
        format_key: typedSlot.format_key,
        design_id: typedSlot.design_id,
        quantity: remaining,
      });
    }
  }

  const { error: deleteError } = await admin.from('market_shelf_slots').delete().eq('id', slotId);
  if (deleteError) {
    return NextResponse.json({ error: '下架失敗，請稍後再試' }, { status: 500 });
  }

  // 下架的格子原本佔用了貨架時間軸上一段「保留給它的排程時間」（從 active_from 到
  // active_from+quantity分鐘），提早下架代表這段時間有一部分沒被真的用到，排在它後面的格子
  // 不該繼續傻等到原本排定的時間才開始賣——要把這段「省下來的時間」整批補回去，讓後面的格子
  // 提前開始（2026-08-01 修正：Peggy 實測抓到「下架後，排在後面的東西沒有跟著往前遞補」的 bug）。
  // 算法：這個格子原本「排定的完整結束時間」減去「現在或它原本開始時間，取比較晚的那個」，
  // 差額就是省下來的時間；同貨架上排定時間點在它之後的格子，通通往前移動這段差額。
  const timeSavedMs = computeTimeSavedOnEarlyDelist(typedSlot, now);

  if (timeSavedMs > 0) {
    const { data: laterSlots } = await admin
      .from('market_shelf_slots')
      .select('id, active_from')
      .eq('shelf_id', typedSlot.shelf_id)
      .gte('active_from', typedSlot.active_from);
    for (const later of laterSlots ?? []) {
      const newActiveFrom = new Date(new Date(later.active_from).getTime() - timeSavedMs).toISOString();
      await admin.from('market_shelf_slots').update({ active_from: newActiveFrom }).eq('id', later.id);
    }
  }

  return NextResponse.json({ ok: true, returnedToWarehouse: remaining });
}
