import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { collectBatch, collectAllReadyBatches } from './collect';
import { FakeSupabase } from '../../test/fakeSupabase';

function admin(fake: FakeSupabase): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

const NOW = new Date('2026-08-18T00:00:00Z').getTime();
const READY = new Date(NOW - 60_000).toISOString(); // 1分鐘前就完成了
const NOT_READY = new Date(NOW + 60_000).toISOString(); // 1分鐘後才完成

describe('collectBatch', () => {
  it('找不到這筆批次（不存在或不是自己的） -> 400', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', []);
    const result = await collectBatch(admin(fake), 'u1', 999, NOW);
    expect(result).toEqual({ ok: false, error: '找不到這筆生產紀錄，或已經收成過了', status: 400 });
  });

  it('已經收成過了（status不是in_progress） -> 400', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [
      { id: 1, user_id: 'u1', status: 'collected', ready_at: READY, format_key: 'poster', design_id: 1, quantity: 4 },
    ]);
    const result = await collectBatch(admin(fake), 'u1', 1, NOW);
    expect(result).toEqual({ ok: false, error: '找不到這筆生產紀錄，或已經收成過了', status: 400 });
  });

  it('還沒生產完成（ready_at在未來） -> 400', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [
      { id: 1, user_id: 'u1', status: 'in_progress', ready_at: NOT_READY, format_key: 'poster', design_id: 1, quantity: 4 },
    ]);
    const result = await collectBatch(admin(fake), 'u1', 1, NOW);
    expect(result).toEqual({ ok: false, error: '還沒生產完成，請再等一下', status: 400 });
  });

  it('倉庫放不下 -> 400，帶目前/上限數字，批次狀態不會被改動', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [
      { id: 1, user_id: 'u1', status: 'in_progress', ready_at: READY, format_key: 'poster', design_id: 1, quantity: 10 },
    ]);
    fake.seed('factory_inventory_items', [{ id: 1, user_id: 'u1', format_key: 'card', design_id: 2, quantity: 295 }]);
    fake.seed('users', [{ id: 'u1', warehouse_capacity: 300 }]); // 295+10=305 > 300

    const result = await collectBatch(admin(fake), 'u1', 1, NOW);

    expect(result).toEqual({ ok: false, error: '工廠倉庫放不下了（目前 295/300），請先去超市上架清出空間，或花錢升級倉庫容量', status: 400 });
    expect(fake.rows('factory_production_batches')[0].status).toBe('in_progress');
  });

  it('成功：已有同款式/同設計的庫存 -> 疊加數量，不新增列', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [
      { id: 1, user_id: 'u1', status: 'in_progress', ready_at: READY, format_key: 'poster', design_id: 1, quantity: 4 },
    ]);
    fake.seed('factory_inventory_items', [{ id: 5, user_id: 'u1', format_key: 'poster', design_id: 1, quantity: 6 }]);
    fake.seed('users', [{ id: 'u1', warehouse_capacity: 300 }]);

    const result = await collectBatch(admin(fake), 'u1', 1, NOW);

    expect(result).toEqual({ ok: true, quantity: 4 });
    expect(fake.rows('factory_production_batches')[0].status).toBe('collected');
    const inventory = fake.rows('factory_inventory_items');
    expect(inventory).toHaveLength(1);
    expect(inventory[0].quantity).toBe(10);
  });

  it('成功：沒有既有庫存列 -> 新增一列', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [
      { id: 1, user_id: 'u1', status: 'in_progress', ready_at: READY, format_key: 'poster', design_id: 1, quantity: 4 },
    ]);
    fake.seed('factory_inventory_items', []);
    fake.seed('users', [{ id: 'u1', warehouse_capacity: 300 }]);

    const result = await collectBatch(admin(fake), 'u1', 1, NOW);

    expect(result).toEqual({ ok: true, quantity: 4 });
    const inventory = fake.rows('factory_inventory_items');
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({ user_id: 'u1', format_key: 'poster', design_id: 1, quantity: 4 });
  });
});

describe('collectAllReadyBatches', () => {
  it('沒有已完成的批次 -> {collected:0, skipped:0}', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [
      { id: 1, user_id: 'u1', status: 'in_progress', ready_at: NOT_READY, format_key: 'poster', design_id: 1, quantity: 4 },
    ]);
    const result = await collectAllReadyBatches(admin(fake), 'u1', NOW);
    expect(result).toEqual({ collected: 0, skipped: 0 });
  });

  it('全部收得下 -> 全部收成，庫存正確疊加', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [
      { id: 1, user_id: 'u1', status: 'in_progress', ready_at: READY, format_key: 'poster', design_id: 1, quantity: 4 },
      { id: 2, user_id: 'u1', status: 'in_progress', ready_at: READY, format_key: 'card', design_id: 2, quantity: 3 },
    ]);
    fake.seed('factory_inventory_items', []);
    fake.seed('users', [{ id: 'u1', warehouse_capacity: 300 }]);

    const result = await collectAllReadyBatches(admin(fake), 'u1', NOW);

    expect(result).toEqual({ collected: 2, skipped: 0 });
    expect(fake.rows('factory_inventory_items')).toHaveLength(2);
    expect(fake.rows('factory_production_batches').every((b) => b.status === 'collected')).toBe(true);
  });

  it('倉庫中途放不下 -> 依ready_at由舊到新收到滿為止，後面的批次維持in_progress、算進skipped', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [
      // id2最早完成、id1其次、id3最晚 —— 驗證是照ready_at排序，不是照id順序
      { id: 1, user_id: 'u1', status: 'in_progress', ready_at: new Date(NOW - 60_000).toISOString(), format_key: 'poster', design_id: 1, quantity: 5 },
      { id: 2, user_id: 'u1', status: 'in_progress', ready_at: new Date(NOW - 120_000).toISOString(), format_key: 'card', design_id: 2, quantity: 3 },
      { id: 3, user_id: 'u1', status: 'in_progress', ready_at: new Date(NOW - 30_000).toISOString(), format_key: 'sticker', design_id: 3, quantity: 5 },
    ]);
    fake.seed('factory_inventory_items', []);
    fake.seed('users', [{ id: 'u1', warehouse_capacity: 10 }]); // 3(id2)+5(id1)=8 ok，再+5(id3)=13 超過

    const result = await collectAllReadyBatches(admin(fake), 'u1', NOW);

    expect(result).toEqual({ collected: 2, skipped: 1 });
    const batches = fake.rows('factory_production_batches');
    expect(batches.find((b) => b.id === 2)?.status).toBe('collected'); // 最早完成的先收
    expect(batches.find((b) => b.id === 1)?.status).toBe('collected');
    expect(batches.find((b) => b.id === 3)?.status).toBe('in_progress'); // 倉庫滿了，維持未收成
  });

  it('未來才完成的批次不會被算進去（只挑ready_at<=now的）', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [
      { id: 1, user_id: 'u1', status: 'in_progress', ready_at: READY, format_key: 'poster', design_id: 1, quantity: 4 },
      { id: 2, user_id: 'u1', status: 'in_progress', ready_at: NOT_READY, format_key: 'card', design_id: 2, quantity: 3 },
    ]);
    fake.seed('factory_inventory_items', []);
    fake.seed('users', [{ id: 'u1', warehouse_capacity: 300 }]);

    const result = await collectAllReadyBatches(admin(fake), 'u1', NOW);

    expect(result).toEqual({ collected: 1, skipped: 0 });
    expect(fake.rows('factory_production_batches').find((b) => b.id === 2)?.status).toBe('in_progress');
  });
});
