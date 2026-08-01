import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchWarehouseCapacity } from '@/lib/supabase/market';
import type { FactoryProductionBatch } from '@/types/database';

// 一鍵收成：把所有「已完成、還沒收成」的生產批次一次收進工廠倉庫（回應 Peggy 提出的需求：
// 機器一多、常常會同時有好幾批完成，逐批按收成很煩）。
// 依 ready_at 由舊到新依序收成，遇到會讓倉庫超過容量的那一批就停下來（後面更晚完成的批次
// 也一併不收，維持「先完成的先收」的公平順序），回報實際收了幾批、還剩幾批因為倉庫滿了沒收。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: batchesData } = await admin
    .from('factory_production_batches')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .lte('ready_at', new Date().toISOString())
    .order('ready_at', { ascending: true });
  const readyBatches = (batchesData ?? []) as FactoryProductionBatch[];

  if (readyBatches.length === 0) {
    return NextResponse.json({ ok: true, collected: 0, skipped: 0 });
  }

  const { data: inventoryRows } = await admin.from('factory_inventory_items').select('quantity').eq('user_id', user.id);
  let currentTotal = (inventoryRows ?? []).reduce((sum, row) => sum + row.quantity, 0);
  const capacity = await fetchWarehouseCapacity(admin, user.id);

  let collected = 0;

  for (const batch of readyBatches) {
    if (currentTotal + batch.quantity > capacity) break;

    const { error: batchError } = await admin
      .from('factory_production_batches')
      .update({ status: 'collected', collected_at: new Date().toISOString() })
      .eq('id', batch.id);
    if (batchError) break;

    const { data: existing } = await admin
      .from('factory_inventory_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('format_key', batch.format_key)
      .eq('design_id', batch.design_id)
      .maybeSingle();

    if (existing) {
      await admin
        .from('factory_inventory_items')
        .update({ quantity: existing.quantity + batch.quantity, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await admin.from('factory_inventory_items').insert({
        user_id: user.id,
        format_key: batch.format_key,
        design_id: batch.design_id,
        quantity: batch.quantity,
      });
    }

    currentTotal += batch.quantity;
    collected += 1;
  }

  const skipped = readyBatches.length - collected;
  return NextResponse.json({ ok: true, collected, skipped });
}
