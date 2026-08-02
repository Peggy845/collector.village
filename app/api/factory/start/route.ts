import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCurrencyBalance } from '@/lib/supabase/currency';
import { findMachine, findFormat, MAX_QUEUE_PER_MACHINE, computeQueuedBatchReadyAt } from '@/lib/factory/catalog';

// 開始生產：把一批新工作排進機台的生產佇列（見 PROJECT_PROGRESS.md 已定案項目31補充：
// 同一台機器可以同時排最多 MAX_QUEUE_PER_MACHINE 批，依序生產，玩家不用每 10~30 分鐘就開一次遊戲）。
// 全部用 service role 執行，一般角色沒有這張表的 insert 權限（見 supabase/schema.sql），
// 避免玩家繞過這支 API 直接竄改遊戲幣或生產數量。
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

  const { data: queue } = await admin
    .from('factory_production_batches')
    .select('ready_at')
    .eq('user_id', user.id)
    .eq('machine_key', machineKey)
    .eq('status', 'in_progress')
    .order('ready_at', { ascending: false });

  const existingQueue = queue ?? [];
  if (existingQueue.length >= MAX_QUEUE_PER_MACHINE) {
    return NextResponse.json(
      { error: `這台機器排隊已滿（最多同時排 ${MAX_QUEUE_PER_MACHINE} 批），請等前面收成後再排` },
      { status: 400 }
    );
  }

  const cost = machine.materialCost;
  const balance = await fetchCurrencyBalance(admin, user.id);
  if (balance < cost) {
    return NextResponse.json({ error: `遊戲幣不足，需要 ${cost} 枚，目前只有 ${balance} 枚` }, { status: 400 });
  }

  const readyAt = computeQueuedBatchReadyAt(existingQueue[0]?.ready_at ?? null, Date.now(), format.productionMinutes);

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
