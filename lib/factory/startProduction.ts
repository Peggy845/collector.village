import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCurrencyBalance } from '@/lib/supabase/currency';
import { findMachine, findFormat, MAX_QUEUE_PER_MACHINE, computeQueuedBatchReadyAt } from '@/lib/factory/catalog';

// 開始生產的共用邏輯，從 app/api/factory/start/route.ts 抽出來，讓「工廠頁直接排產」跟
// 「設計坊直接生產」（見 idea/設計坊.png「直接生產」按鈕）共用同一份排隊/扣幣/寫入邏輯，
// 不重複寫（2026-08-02，設計坊系統 v1）。
export type StartProductionResult = { ok: true; readyAt: string } | { ok: false; error: string; status: number };

export async function startProductionBatch(
  admin: SupabaseClient,
  params: { userId: string; machineKey: string; formatKey: string; designId: number },
  now: number = Date.now()
): Promise<StartProductionResult> {
  const { userId, machineKey, formatKey, designId } = params;

  const machine = findMachine(machineKey);
  const format = findFormat(machineKey, formatKey);
  if (!machine || !format || !designId) {
    return { ok: false, error: '請求格式錯誤', status: 400 };
  }

  // 設計圖必須是「管理員全站圖庫」（user_id為null）或「自己畫的」，不能拿別人自畫的設計去生產
  // （比照 supabase/schema.sql 第12節 RLS 的判斷邏輯，這裡是 service role 呼叫要另外手動檢查一次）。
  const { data: design } = await admin
    .from('factory_designs')
    .select('id, user_id')
    .eq('id', designId)
    .eq('is_active', true)
    .maybeSingle();
  if (!design || (design.user_id !== null && design.user_id !== userId)) {
    return { ok: false, error: '找不到這張設計圖', status: 400 };
  }

  const { data: queue } = await admin
    .from('factory_production_batches')
    .select('ready_at')
    .eq('user_id', userId)
    .eq('machine_key', machineKey)
    .eq('status', 'in_progress')
    .order('ready_at', { ascending: false });

  const existingQueue = queue ?? [];
  if (existingQueue.length >= MAX_QUEUE_PER_MACHINE) {
    return {
      ok: false,
      error: `這台機器排隊已滿（最多同時排 ${MAX_QUEUE_PER_MACHINE} 批），請等前面收成後再排`,
      status: 400,
    };
  }

  const cost = machine.materialCost;
  const balance = await fetchCurrencyBalance(admin, userId);
  if (balance < cost) {
    return { ok: false, error: `遊戲幣不足，需要 ${cost} 枚，目前只有 ${balance} 枚`, status: 400 };
  }

  const readyAt = computeQueuedBatchReadyAt(existingQueue[0]?.ready_at ?? null, now, format.productionMinutes);

  const { error: batchError } = await admin.from('factory_production_batches').insert({
    user_id: userId,
    machine_key: machineKey,
    format_key: formatKey,
    design_id: designId,
    quantity: format.outputQuantity,
    material_cost: cost,
    status: 'in_progress',
    ready_at: readyAt,
  });
  if (batchError) {
    return { ok: false, error: '建立生產批次失敗，請稍後再試', status: 500 };
  }

  const { error: ledgerError } = await admin.from('game_currency_ledger').insert({
    user_id: userId,
    amount: -cost,
    reason: `factory_start:machine=${machineKey};format=${formatKey}`,
  });
  if (ledgerError) {
    console.error('factory ledger deduction failed after batch insert', ledgerError);
  }

  return { ok: true, readyAt };
}
