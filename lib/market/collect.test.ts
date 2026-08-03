import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { collectMarketRevenue } from './collect';
import { FakeSupabase } from '../../test/fakeSupabase';

function admin(fake: FakeSupabase): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

const START = new Date('2026-08-03T00:00:00Z').getTime();

describe('collectMarketRevenue', () => {
  it('沒有貨架時直接回傳0，不查任何 slot', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_shelves', []);
    fake.seed('market_shelf_slots', []);

    const revenue = await collectMarketRevenue(admin(fake), 'u1', START);
    expect(revenue).toBe(0);
  });

  it('部分賣完（還在賣）：更新 collected_quantity，不刪除這筆 slot', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_shelves', [{ id: 1, user_id: 'u1' }]);
    fake.seed('market_shelf_slots', [
      {
        id: 10,
        shelf_id: 1,
        format_key: 'postcard', // sellPricePerUnit 10
        design_id: 1,
        quantity: 10,
        collected_quantity: 0,
        active_from: new Date(START - 3 * 60_000).toISOString(), // 3分鐘前開賣，賣了3件
        listed_at: new Date(START - 3 * 60_000).toISOString(),
      },
    ]);

    const revenue = await collectMarketRevenue(admin(fake), 'u1', START);

    expect(revenue).toBe(30); // 3件 * 10幣
    const slots = fake.rows('market_shelf_slots');
    expect(slots).toHaveLength(1);
    expect(slots[0].collected_quantity).toBe(3);
  });

  it('剛好全部賣完（不管入帳沒過）：這筆 slot 整列刪除、營收算完整', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_shelves', [{ id: 1, user_id: 'u1' }]);
    fake.seed('market_shelf_slots', [
      {
        id: 11,
        shelf_id: 1,
        format_key: 'postcard',
        design_id: 1,
        quantity: 5,
        collected_quantity: 0,
        active_from: new Date(START - 10 * 60_000).toISOString(), // 10分鐘前開賣，5件早就賣完
        listed_at: new Date(START - 10 * 60_000).toISOString(),
      },
    ]);

    const revenue = await collectMarketRevenue(admin(fake), 'u1', START);

    expect(revenue).toBe(50); // 5件 * 10幣
    expect(fake.rows('market_shelf_slots')).toHaveLength(0);
  });

  it('已經入帳過的部分不會重複算，只算新賣出的差額', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_shelves', [{ id: 1, user_id: 'u1' }]);
    fake.seed('market_shelf_slots', [
      {
        id: 12,
        shelf_id: 1,
        format_key: 'postcard',
        design_id: 1,
        quantity: 10,
        collected_quantity: 3, // 之前已經入帳過3件
        active_from: new Date(START - 5 * 60_000).toISOString(), // 現在賣了5件
        listed_at: new Date(START - 5 * 60_000).toISOString(),
      },
    ]);

    const revenue = await collectMarketRevenue(admin(fake), 'u1', START);

    expect(revenue).toBe(20); // 新賣出的2件 * 10幣
    expect(fake.rows('market_shelf_slots')[0].collected_quantity).toBe(5);
  });

  it('同一秒內按兩次收款，第二次差額是0，不會重複入帳', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_shelves', [{ id: 1, user_id: 'u1' }]);
    fake.seed('market_shelf_slots', [
      {
        id: 13,
        shelf_id: 1,
        format_key: 'postcard',
        design_id: 1,
        quantity: 10,
        collected_quantity: 0,
        active_from: new Date(START - 3 * 60_000).toISOString(),
        listed_at: new Date(START - 3 * 60_000).toISOString(),
      },
    ]);

    const first = await collectMarketRevenue(admin(fake), 'u1', START);
    const second = await collectMarketRevenue(admin(fake), 'u1', START);

    expect(first).toBe(30);
    expect(second).toBe(0);
  });

  it('併發搶輸（樂觀鎖 eq 條件不match）時不把這筆算進營收', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_shelves', [{ id: 1, user_id: 'u1' }]);
    fake.seed('market_shelf_slots', [
      {
        id: 14,
        shelf_id: 1,
        format_key: 'postcard',
        design_id: 1,
        quantity: 10,
        collected_quantity: 0,
        active_from: new Date(START - 3 * 60_000).toISOString(),
        listed_at: new Date(START - 3 * 60_000).toISOString(),
      },
    ]);

    // 模擬另一個請求在這次 update 真正送出前，先一步把 collected_quantity 改掉，
    // 讓 .eq('collected_quantity', 0) 這個樂觀鎖條件配不到任何列。
    fake.onceBeforeExecute('market_shelf_slots', 'update', () => {
      const row = fake.mutableRows('market_shelf_slots').find((r) => r.id === 14)!;
      row.collected_quantity = 3;
    });

    const revenue = await collectMarketRevenue(admin(fake), 'u1', START);

    expect(revenue).toBe(0);
    expect(fake.rows('market_shelf_slots')[0].collected_quantity).toBe(3);
  });
});
