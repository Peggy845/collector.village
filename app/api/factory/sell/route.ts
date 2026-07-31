import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findFormatByKey } from '@/lib/factory/catalog';

// 賣出：v1 超市只做系統固定價格收購，扣掉倉庫庫存、發放遊戲幣。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const formatKey = body?.formatKey;
  const designId = Number(body?.designId);
  const quantity = Number(body?.quantity);

  const format = findFormatByKey(formatKey);
  if (!format || !designId || !quantity || quantity < 1) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: item } = await admin
    .from('factory_inventory_items')
    .select('id, quantity')
    .eq('user_id', user.id)
    .eq('format_key', formatKey)
    .eq('design_id', designId)
    .maybeSingle();

  if (!item || item.quantity < quantity) {
    return NextResponse.json({ error: '倉庫裡沒有這麼多件可以賣' }, { status: 400 });
  }

  const revenue = quantity * format.sellPricePerUnit;

  const { error: updateError } = await admin
    .from('factory_inventory_items')
    .update({ quantity: item.quantity - quantity, updated_at: new Date().toISOString() })
    .eq('id', item.id);
  if (updateError) {
    return NextResponse.json({ error: '賣出失敗，請稍後再試' }, { status: 500 });
  }

  const { error: ledgerError } = await admin.from('game_currency_ledger').insert({
    user_id: user.id,
    amount: revenue,
    reason: `factory_sell:format=${formatKey};design=${designId};quantity=${quantity}`,
  });
  if (ledgerError) {
    return NextResponse.json({ error: '入帳失敗，請稍後再試' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, revenue });
}
