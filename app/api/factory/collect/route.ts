import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchWarehouseCapacity } from '@/lib/supabase/market';
import type { FactoryProductionBatch } from '@/types/database';

// 收成：把生產批次標記為 collected，並把數量疊加進工廠倉庫庫存。
// 倉庫有容量上限（見 PROJECT_PROGRESS.md 已定案項目 32），收成前先檢查會不會超過上限，
// 超過就擋下來——這是刻意的設計，逼玩家要嘛先去超市上架清空間、要嘛花錢升級倉庫，
// 不能無限生產又不處理，是「工廠↔超市」資源循環成立的關鍵。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const batchId = Number(body?.batchId);
  if (!batchId) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: batch } = await admin
    .from('factory_production_batches')
    .select('*')
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();

  const typedBatch = batch as FactoryProductionBatch | null;
  if (!typedBatch || typedBatch.status !== 'in_progress') {
    return NextResponse.json({ error: '找不到這筆生產紀錄，或已經收成過了' }, { status: 400 });
  }
  if (new Date(typedBatch.ready_at).getTime() > Date.now()) {
    return NextResponse.json({ error: '還沒生產完成，請再等一下' }, { status: 400 });
  }

  const { data: inventoryRows } = await admin.from('factory_inventory_items').select('quantity').eq('user_id', user.id);
  const currentTotal = (inventoryRows ?? []).reduce((sum, row) => sum + row.quantity, 0);
  const capacity = await fetchWarehouseCapacity(admin, user.id);
  if (currentTotal + typedBatch.quantity > capacity) {
    return NextResponse.json(
      {
        error: `工廠倉庫放不下了（目前 ${currentTotal}/${capacity}），請先去超市上架清出空間，或花錢升級倉庫容量`,
      },
      { status: 400 }
    );
  }

  const { error: batchError } = await admin
    .from('factory_production_batches')
    .update({ status: 'collected', collected_at: new Date().toISOString() })
    .eq('id', batchId);
  if (batchError) {
    return NextResponse.json({ error: '收成失敗，請稍後再試' }, { status: 500 });
  }

  const { data: existing } = await admin
    .from('factory_inventory_items')
    .select('id, quantity')
    .eq('user_id', user.id)
    .eq('format_key', typedBatch.format_key)
    .eq('design_id', typedBatch.design_id)
    .maybeSingle();

  if (existing) {
    await admin
      .from('factory_inventory_items')
      .update({ quantity: existing.quantity + typedBatch.quantity, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await admin.from('factory_inventory_items').insert({
      user_id: user.id,
      format_key: typedBatch.format_key,
      design_id: typedBatch.design_id,
      quantity: typedBatch.quantity,
    });
  }

  return NextResponse.json({ ok: true, quantity: typedBatch.quantity });
}
