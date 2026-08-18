import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { upgradeWarehouse } from './upgradeWarehouse';
import { FakeSupabase } from '../../test/fakeSupabase';

function admin(fake: FakeSupabase): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('upgradeWarehouse', () => {
  it('遊戲幣不足 -> 400，帶正確價格/目前餘額，不會真的更新容量', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', warehouse_capacity: 300 }]);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 400 }]); // 升級要500，只有400

    const result = await upgradeWarehouse(admin(fake), 'u1');

    expect(result).toEqual({ ok: false, error: '遊戲幣不足，升級倉庫需要 500 枚，目前只有 400 枚', status: 400 });
    expect(fake.rows('users')[0].warehouse_capacity).toBe(300);
  });

  it('剛好等於門檻也算夠 -> 成功', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', warehouse_capacity: 300 }]);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 500 }]);

    const result = await upgradeWarehouse(admin(fake), 'u1');

    expect(result).toEqual({ ok: true, newCapacity: 350 });
  });

  it('成功：容量正確+50、帳本正確扣款500且reason正確', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', warehouse_capacity: 300 }]);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 1000 }]);

    const result = await upgradeWarehouse(admin(fake), 'u1');

    expect(result).toEqual({ ok: true, newCapacity: 350 });
    expect(fake.rows('users')[0].warehouse_capacity).toBe(350);
    const ledger = fake.rows('game_currency_ledger');
    expect(ledger).toHaveLength(2);
    expect(ledger[1]).toMatchObject({ user_id: 'u1', amount: -500, reason: 'factory_upgrade_warehouse' });
  });

  it('升級沒有上限，可以連續升級多次，每次都疊加50', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', warehouse_capacity: 300 }]);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 2000 }]);

    const first = await upgradeWarehouse(admin(fake), 'u1');
    const second = await upgradeWarehouse(admin(fake), 'u1');

    expect(first).toEqual({ ok: true, newCapacity: 350 });
    expect(second).toEqual({ ok: true, newCapacity: 400 });
    expect(fake.rows('users')[0].warehouse_capacity).toBe(400);
  });

  it('users列不存在時容量預設300起算（跟fetchWarehouseCapacity的預設值一致）', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', []);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 1000 }]);

    const result = await upgradeWarehouse(admin(fake), 'u1');

    expect(result).toEqual({ ok: true, newCapacity: 350 });
  });
});
