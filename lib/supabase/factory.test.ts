import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchDesignIdsStillInUse, fetchFactoryDesigns } from './factory';
import { FakeSupabase } from '../../test/fakeSupabase';

function client(fake: FakeSupabase): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

const NOW = new Date('2026-08-18T00:00:00Z').getTime();

describe('fetchDesignIdsStillInUse', () => {
  it('空陣列直接回傳空集合', async () => {
    const fake = new FakeSupabase();
    const result = await fetchDesignIdsStillInUse(client(fake), 'u1', [], NOW);
    expect(result).toEqual(new Set());
  });

  it('正在生產排隊中（status=in_progress）的算在使用中', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [{ user_id: 'u1', status: 'in_progress', design_id: 1 }]);
    fake.seed('factory_inventory_items', []);
    fake.seed('market_furniture', []);
    const result = await fetchDesignIdsStillInUse(client(fake), 'u1', [1], NOW);
    expect(result).toEqual(new Set([1]));
  });

  it('已收成的批次（status=collected）不算在使用中', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', [{ user_id: 'u1', status: 'collected', design_id: 1 }]);
    fake.seed('factory_inventory_items', []);
    fake.seed('market_furniture', []);
    const result = await fetchDesignIdsStillInUse(client(fake), 'u1', [1], NOW);
    expect(result).toEqual(new Set());
  });

  it('工廠倉庫還有庫存（quantity>0）的算在使用中', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', []);
    fake.seed('factory_inventory_items', [{ user_id: 'u1', design_id: 2, quantity: 3 }]);
    fake.seed('market_furniture', []);
    const result = await fetchDesignIdsStillInUse(client(fake), 'u1', [2], NOW);
    expect(result).toEqual(new Set([2]));
  });

  it('倉庫庫存quantity=0不算在使用中（已經全部生產出去了）', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', []);
    fake.seed('factory_inventory_items', [{ user_id: 'u1', design_id: 2, quantity: 0 }]);
    fake.seed('market_furniture', []);
    const result = await fetchDesignIdsStillInUse(client(fake), 'u1', [2], NOW);
    expect(result).toEqual(new Set());
  });

  it('貨架上還有沒賣完的（remaining>0）算在使用中', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', []);
    fake.seed('factory_inventory_items', []);
    fake.seed('market_furniture', [{ id: 100, user_id: 'u1' }]);
    fake.seed('market_furniture_slots', [
      {
        furniture_id: 100,
        design_id: 3,
        quantity: 10,
        active_from: new Date(NOW - 60_000).toISOString(), // 1分鐘前開賣，還沒賣完
      },
    ]);
    const result = await fetchDesignIdsStillInUse(client(fake), 'u1', [3], NOW);
    expect(result).toEqual(new Set([3]));
  });

  it('貨架賣完了（remaining=0，不管入帳了沒）不算在使用中', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', []);
    fake.seed('factory_inventory_items', []);
    fake.seed('market_furniture', [{ id: 100, user_id: 'u1' }]);
    fake.seed('market_furniture_slots', [
      {
        furniture_id: 100,
        design_id: 3,
        quantity: 1,
        active_from: new Date(NOW - 60 * 60_000).toISOString(), // 1小時前開賣，早就賣完
      },
    ]);
    const result = await fetchDesignIdsStillInUse(client(fake), 'u1', [3], NOW);
    expect(result).toEqual(new Set());
  });

  it('三個來源都沒有引用的設計不在使用中', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_production_batches', []);
    fake.seed('factory_inventory_items', []);
    fake.seed('market_furniture', []);
    const result = await fetchDesignIdsStillInUse(client(fake), 'u1', [1, 2, 3], NOW);
    expect(result).toEqual(new Set());
  });
});

describe('fetchFactoryDesigns', () => {
  it('管理員圖庫（user_id為null）跟自己的設計都看得到，別人自畫的看不到', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [
      { id: 1, user_id: null, is_active: true, player_design_id: null, created_at: '2026-01-01' },
      { id: 2, user_id: 'u1', is_active: true, player_design_id: null, created_at: '2026-01-02' },
      { id: 3, user_id: 'someone-else', is_active: true, player_design_id: null, created_at: '2026-01-03' },
    ]);
    const result = await fetchFactoryDesigns(client(fake), 'u1', NOW);
    expect(result.map((d) => d.id).sort()).toEqual([1, 2]);
  });

  it('沒有掛player_design_id的設計（正式圖庫圖）一定會出現，不受temp判斷影響', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: null, is_active: true, player_design_id: null, created_at: '2026-01-01' }]);
    const result = await fetchFactoryDesigns(client(fake), 'u1', NOW);
    expect(result).toHaveLength(1);
  });

  it('掛temp暫存設計但還在使用中（有庫存） -> 保留在清單裡', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: 'u1', is_active: true, player_design_id: 10, created_at: '2026-01-01' }]);
    fake.seed('player_designs', [{ id: 10, status: 'temp' }]);
    fake.seed('factory_production_batches', []);
    fake.seed('factory_inventory_items', [{ user_id: 'u1', design_id: 1, quantity: 2 }]);
    fake.seed('market_furniture', []);

    const result = await fetchFactoryDesigns(client(fake), 'u1', NOW);
    expect(result.map((d) => d.id)).toEqual([1]);
  });

  it('掛temp暫存設計、賣完用完了 -> 從清單消失（呼應idea/bug_1.png回報的問題）', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: 'u1', is_active: true, player_design_id: 10, created_at: '2026-01-01' }]);
    fake.seed('player_designs', [{ id: 10, status: 'temp' }]);
    fake.seed('factory_production_batches', []);
    fake.seed('factory_inventory_items', []);
    fake.seed('market_furniture', []);

    const result = await fetchFactoryDesigns(client(fake), 'u1', NOW);
    expect(result).toEqual([]);
  });

  it('player_design狀態不是temp（正式存檔）的設計，即使沒在用也不會被濾掉', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: 'u1', is_active: true, player_design_id: 10, created_at: '2026-01-01' }]);
    fake.seed('player_designs', [{ id: 10, status: 'saved' }]);

    const result = await fetchFactoryDesigns(client(fake), 'u1', NOW);
    expect(result.map((d) => d.id)).toEqual([1]);
  });
});
