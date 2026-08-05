import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { autoRestockUser } from './restock';
import { FakeSupabase } from '../../test/fakeSupabase';

// restock.ts 內部用 Date.now() 而不是可注入的參數，所以這裡凡是要模擬「已經在賣、
// 剩餘量算滿額」的既有 slot，active_from 一律設在測試當下的「未來」，確保
// computeSlotRemaining 不會因為測試執行花了幾毫秒就被誤判成已經賣掉一些。
const FUTURE = () => new Date(Date.now() + 60_000).toISOString();

function admin(fake: FakeSupabase): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('autoRestockUser', () => {
  it('關閉自動上架時完全不動任何資料', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', market_auto_restock: false }]);
    fake.seed('market_furniture', [{ id: 1, user_id: 'u1', furniture_type: 'bookshelf', capacity: 10, created_at: FUTURE() }]);
    fake.seed('factory_inventory_items', [
      { id: 1, user_id: 'u1', format_key: 'postcard', design_id: 1, quantity: 5, updated_at: FUTURE() },
    ]);
    fake.seed('market_furniture_slots', []);

    await autoRestockUser(admin(fake), 'u1');

    expect(fake.rows('market_furniture_slots')).toHaveLength(0);
    expect(fake.rows('factory_inventory_items')[0].quantity).toBe(5);
  });

  it('開啟自動上架時把庫存補進空家具，最多補到容量上限', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', market_auto_restock: true }]);
    fake.seed('market_furniture', [{ id: 1, user_id: 'u1', furniture_type: 'bookshelf', capacity: 10, created_at: FUTURE() }]);
    fake.seed('factory_inventory_items', [
      { id: 1, user_id: 'u1', format_key: 'postcard', design_id: 1, quantity: 15, updated_at: FUTURE() },
    ]);
    fake.seed('market_furniture_slots', []);

    await autoRestockUser(admin(fake), 'u1');

    const slots = fake.rows('market_furniture_slots');
    expect(slots).toHaveLength(1);
    expect(slots[0].quantity).toBe(10);
    expect(fake.rows('factory_inventory_items')[0].quantity).toBe(5);
  });

  it('家具已經有貨在賣時，只補剩餘空位，不會超過容量', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', market_auto_restock: true }]);
    fake.seed('market_furniture', [{ id: 1, user_id: 'u1', furniture_type: 'bookshelf', capacity: 10, created_at: FUTURE() }]);
    fake.seed('market_furniture_slots', [
      {
        id: 1,
        furniture_id: 1,
        format_key: 'postcard',
        design_id: 1,
        quantity: 4,
        collected_quantity: 0,
        active_from: FUTURE(),
        listed_at: FUTURE(),
      },
    ]);
    fake.seed('factory_inventory_items', [
      { id: 2, user_id: 'u1', format_key: 'sticker', design_id: 2, quantity: 10, updated_at: FUTURE() },
    ]);

    await autoRestockUser(admin(fake), 'u1');

    const slots = fake.rows('market_furniture_slots');
    expect(slots).toHaveLength(2);
    const newSlot = slots.find((s) => s.design_id === 2)!;
    expect(newSlot.quantity).toBe(6); // 容量10 - 既有4 = 剩6個空位
    expect(fake.rows('factory_inventory_items')[0].quantity).toBe(4); // 10 - 6
  });

  it('一個家具補滿後接著補下一個家具（依 created_at 順序），直到庫存用完為止', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', market_auto_restock: true }]);
    fake.seed('market_furniture', [
      { id: 1, user_id: 'u1', furniture_type: 'bookshelf', capacity: 5, created_at: new Date(1000).toISOString() },
      { id: 2, user_id: 'u1', furniture_type: 'bookshelf', capacity: 5, created_at: new Date(2000).toISOString() },
    ]);
    fake.seed('factory_inventory_items', [
      { id: 1, user_id: 'u1', format_key: 'postcard', design_id: 1, quantity: 8, updated_at: FUTURE() },
    ]);
    fake.seed('market_furniture_slots', []);

    await autoRestockUser(admin(fake), 'u1');

    const slots = fake.rows('market_furniture_slots');
    const furniture1Slot = slots.find((s) => s.furniture_id === 1)!;
    const furniture2Slot = slots.find((s) => s.furniture_id === 2)!;
    expect(furniture1Slot.quantity).toBe(5);
    expect(furniture2Slot.quantity).toBe(3);
    expect(fake.rows('factory_inventory_items')[0].quantity).toBe(0);
  });

  it('工廠倉庫沒東西可補時安全地什麼都不做', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', market_auto_restock: true }]);
    fake.seed('market_furniture', [{ id: 1, user_id: 'u1', furniture_type: 'bookshelf', capacity: 10, created_at: FUTURE() }]);
    fake.seed('factory_inventory_items', []);
    fake.seed('market_furniture_slots', []);

    await autoRestockUser(admin(fake), 'u1');

    expect(fake.rows('market_furniture_slots')).toHaveLength(0);
  });

  it('只補家具相容的商品格式，不相容的品項留在倉庫不動（2026-08-05 新增）', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', market_auto_restock: true }]);
    fake.seed('market_furniture', [{ id: 1, user_id: 'u1', furniture_type: 'bookshelf', capacity: 10, created_at: FUTURE() }]);
    fake.seed('factory_inventory_items', [
      { id: 1, user_id: 'u1', format_key: 'postcard', design_id: 1, quantity: 3, updated_at: FUTURE() }, // 書櫃相容
      { id: 2, user_id: 'u1', format_key: 'badge', design_id: 2, quantity: 5, updated_at: FUTURE() }, // 書櫃不相容
    ]);
    fake.seed('market_furniture_slots', []);

    await autoRestockUser(admin(fake), 'u1');

    const slots = fake.rows('market_furniture_slots');
    expect(slots).toHaveLength(1);
    expect(slots[0].format_key).toBe('postcard');
    expect(fake.rows('factory_inventory_items').find((r) => r.id === 1)!.quantity).toBe(0);
    expect(fake.rows('factory_inventory_items').find((r) => r.id === 2)!.quantity).toBe(5); // 完全沒被動過
  });

  it('收銀機（純裝飾，capacity 為 null）永遠不會被自動補貨（2026-08-05 新增）', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', market_auto_restock: true }]);
    fake.seed('market_furniture', [{ id: 1, user_id: 'u1', furniture_type: 'cashier', capacity: null, created_at: FUTURE() }]);
    fake.seed('factory_inventory_items', [
      { id: 1, user_id: 'u1', format_key: 'postcard', design_id: 1, quantity: 5, updated_at: FUTURE() },
    ]);
    fake.seed('market_furniture_slots', []);

    await autoRestockUser(admin(fake), 'u1');

    expect(fake.rows('market_furniture_slots')).toHaveLength(0);
    expect(fake.rows('factory_inventory_items')[0].quantity).toBe(5);
  });

  it('混合庫存時，各家具只吃自己相容的格式，不會互搶（2026-08-05 新增）', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', market_auto_restock: true }]);
    fake.seed('market_furniture', [
      { id: 1, user_id: 'u1', furniture_type: 'bookshelf', capacity: 10, created_at: new Date(1000).toISOString() },
      { id: 2, user_id: 'u1', furniture_type: 'pegboard', capacity: 10, created_at: new Date(2000).toISOString() },
    ]);
    fake.seed('factory_inventory_items', [
      { id: 1, user_id: 'u1', format_key: 'postcard', design_id: 1, quantity: 4, updated_at: FUTURE() },
      { id: 2, user_id: 'u1', format_key: 'badge', design_id: 2, quantity: 6, updated_at: FUTURE() },
    ]);
    fake.seed('market_furniture_slots', []);

    await autoRestockUser(admin(fake), 'u1');

    const slots = fake.rows('market_furniture_slots');
    const bookshelfSlot = slots.find((s) => s.furniture_id === 1)!;
    const pegboardSlot = slots.find((s) => s.furniture_id === 2)!;
    expect(bookshelfSlot.format_key).toBe('postcard');
    expect(bookshelfSlot.quantity).toBe(4);
    expect(pegboardSlot.format_key).toBe('badge');
    expect(pegboardSlot.quantity).toBe(6);
  });
});
