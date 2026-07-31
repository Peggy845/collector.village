import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCurrencyBalance } from '@/lib/supabase/currency';
import { findMachine, findFormat } from '@/lib/factory/catalog';

// 開始生產：扣幣＋建立生產批次。全部用 service role 執行，一般角色沒有這兩張表的 insert 權限
// （見 supabase/schema.sql），避免玩家繞過這支 API 直接竄改遊戲幣或生產數量。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const machineKey = body?.machineKey;
  const formatKey = body?.formatKey;
  const designId = Number(body?.designId);

  const machine = findMachine(machineKey);
  const format = findFormat(machineKey, formatKey);
  if (!machine || !format || !designId) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: design } = await admin
    .from('factory_designs')
    .select('id')
    .eq('id', designId)
    .eq('is_active', true)
    .maybeSingle();
  if (!design) {
    return NextResponse.json({ error: '找不到這張設計圖' }, { status: 400 });
  }

  const { data: busyBatch } = await admin
    .from('factory_production_batches')
    .select('id')
    .eq('user_id', user.id)
    .eq('machine_key', machineKey)
    .eq('status', 'in_progress')
    .maybeSingle();
  if (busyBatch) {
    return NextResponse.json({ error: '這台機器正在生產中，請先收成才能開始下一批' }, { status: 400 });
  }

  const cost = machine.materialCost;
  const balance = await fetchCurrencyBalance(admin, user.id);
  if (balance < cost) {
    return NextResponse.json({ error: `遊戲幣不足，需要 ${cost} 枚，目前只有 ${balance} 枚` }, { status: 400 });
  }

  const readyAt = new Date(Date.now() + format.productionMinutes * 60 * 1000).toISOString();

  // 先建立生產批次、成功了才扣款（順序故意這樣排）：
  // 資料庫有「同一台機器同一時間只能一批生產中」的 partial unique index（見 supabase/schema.sql），
  // 兩個幾乎同時送出的請求可能都通過上面 busyBatch 的預先檢查，但寫入時只有一個會成功、
  // 另一個會撞到 unique constraint 失敗——若扣款在前，失敗的那個請求會變成「扣了錢卻沒開始生產」；
  // 扣款放在後面，最壞情況只是「批次建立了但這次扣款沒扣到」，對玩家比較沒有傷害。
  const { error: batchError } = await admin.from('factory_production_batches').insert({
    user_id: user.id,
    machine_key: machineKey,
    format_key: formatKey,
    design_id: designId,
    quantity: format.outputQuantity,
    material_cost: cost,
    status: 'in_progress',
    ready_at: readyAt,
  });
  if (batchError) {
    if (batchError.code === '23505') {
      return NextResponse.json({ error: '這台機器正在生產中，請先收成才能開始下一批' }, { status: 400 });
    }
    return NextResponse.json({ error: '建立生產批次失敗，請稍後再試' }, { status: 500 });
  }

  const { error: ledgerError } = await admin.from('game_currency_ledger').insert({
    user_id: user.id,
    amount: -cost,
    reason: `factory_start:machine=${machineKey};format=${formatKey}`,
  });
  if (ledgerError) {
    console.error('factory ledger deduction failed after batch insert', ledgerError);
  }

  return NextResponse.json({ ok: true, readyAt });
}
