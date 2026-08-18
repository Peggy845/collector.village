import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchWarehouseCapacity } from '@/lib/supabase/market';
import type { FactoryProductionBatch } from '@/types/database';

// 收成（單筆＋一鍵全收）的核心邏輯，從 app/api/factory/{collect,collect-all}/route.ts
// 抽出來方便寫單元測試（見 lib/factory/collect.test.ts），比照 lib/factory/startProduction.ts
// 同樣的 { ok: true } | { ok: false; error; status } 回傳型別。兩支路由原本各自重複一份
// 「疊加或新增 factory_inventory_items」的邏輯，這裡合併成共用的 addToInventory。
async function addToInventory(admin: SupabaseClient, userId: string, formatKey: string, designId: number, quantity: number, now: number) {
  const { data: existing } = await admin
    .from('factory_inventory_items')
    .select('id, quantity')
    .eq('user_id', userId)
    .eq('format_key', formatKey)
    .eq('design_id', designId)
    .maybeSingle();

  if (existing) {
    await admin
      .from('factory_inventory_items')
      .update({ quantity: existing.quantity + quantity, updated_at: new Date(now).toISOString() })
      .eq('id', existing.id);
  } else {
    await admin.from('factory_inventory_items').insert({ user_id: userId, format_key: formatKey, design_id: designId, quantity });
  }
}

export type CollectBatchResult = { ok: true; quantity: number } | { ok: false; error: string; status: number };

// 倉庫有容量上限（見 PROJECT_PROGRESS.md 已定案項目 32），收成前先檢查會不會超過上限，
// 超過就擋下來——這是刻意的設計，逼玩家要嘛先去超市上架清空間、要嘛花錢升級倉庫，
// 不能無限生產又不處理，是「工廠↔超市」資源循環成立的關鍵。
export async function collectBatch(
  admin: SupabaseClient,
  userId: string,
  batchId: number,
  now: number = Date.now()
): Promise<CollectBatchResult> {
  const { data: batch } = await admin
    .from('factory_production_batches')
    .select('*')
    .eq('id', batchId)
    .eq('user_id', userId)
    .maybeSingle();

  const typedBatch = batch as FactoryProductionBatch | null;
  if (!typedBatch || typedBatch.status !== 'in_progress') {
    return { ok: false, error: '找不到這筆生產紀錄，或已經收成過了', status: 400 };
  }
  if (new Date(typedBatch.ready_at).getTime() > now) {
    return { ok: false, error: '還沒生產完成，請再等一下', status: 400 };
  }

  const { data: inventoryRows } = await admin.from('factory_inventory_items').select('quantity').eq('user_id', userId);
  const currentTotal = ((inventoryRows ?? []) as { quantity: number }[]).reduce((sum, row) => sum + row.quantity, 0);
  const capacity = await fetchWarehouseCapacity(admin, userId);
  if (currentTotal + typedBatch.quantity > capacity) {
    return {
      ok: false,
      error: `工廠倉庫放不下了（目前 ${currentTotal}/${capacity}），請先去超市上架清出空間，或花錢升級倉庫容量`,
      status: 400,
    };
  }

  const { error: batchError } = await admin
    .from('factory_production_batches')
    .update({ status: 'collected', collected_at: new Date(now).toISOString() })
    .eq('id', batchId);
  if (batchError) {
    return { ok: false, error: '收成失敗，請稍後再試', status: 500 };
  }

  await addToInventory(admin, userId, typedBatch.format_key, typedBatch.design_id, typedBatch.quantity, now);

  return { ok: true, quantity: typedBatch.quantity };
}

export interface CollectAllResult {
  collected: number;
  skipped: number;
}

// 依 ready_at 由舊到新依序收成，遇到會讓倉庫超過容量的那一批就停下來（後面更晚完成的批次
// 也一併不收，維持「先完成的先收」的公平順序），回報實際收了幾批、還剩幾批因為倉庫滿了沒收。
export async function collectAllReadyBatches(
  admin: SupabaseClient,
  userId: string,
  now: number = Date.now()
): Promise<CollectAllResult> {
  const { data: batchesData } = await admin
    .from('factory_production_batches')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .lte('ready_at', new Date(now).toISOString())
    .order('ready_at', { ascending: true });
  const readyBatches = (batchesData ?? []) as FactoryProductionBatch[];

  if (readyBatches.length === 0) return { collected: 0, skipped: 0 };

  const { data: inventoryRows } = await admin.from('factory_inventory_items').select('quantity').eq('user_id', userId);
  let currentTotal = ((inventoryRows ?? []) as { quantity: number }[]).reduce((sum, row) => sum + row.quantity, 0);
  const capacity = await fetchWarehouseCapacity(admin, userId);

  let collected = 0;
  for (const batch of readyBatches) {
    if (currentTotal + batch.quantity > capacity) break;

    const { error: batchError } = await admin
      .from('factory_production_batches')
      .update({ status: 'collected', collected_at: new Date(now).toISOString() })
      .eq('id', batch.id);
    if (batchError) break;

    await addToInventory(admin, userId, batch.format_key, batch.design_id, batch.quantity, now);

    currentTotal += batch.quantity;
    collected += 1;
  }

  return { collected, skipped: readyBatches.length - collected };
}
