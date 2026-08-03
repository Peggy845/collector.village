import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { closeMarket, reopenMarket } from './toggleOpen';
import { FakeSupabase } from '../../test/fakeSupabase';

function admin(fake: FakeSupabase): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('closeMarket', () => {
  it('記錄 market_open=false 跟暫停當下的時間點', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', market_open: true, market_closed_at: null }]);

    const now = new Date('2026-08-03T10:00:00Z').getTime();
    const { error } = await closeMarket(admin(fake), 'u1', now);

    expect(error).toBe(false);
    const row = fake.rows('users')[0];
    expect(row.market_open).toBe(false);
    expect(row.market_closed_at).toBe(new Date(now).toISOString());
  });
});

describe('reopenMarket', () => {
  it('把暫停的時長整批加回名下所有貨架格子的 active_from', async () => {
    const fake = new FakeSupabase();
    const closedAt = new Date('2026-08-03T10:00:00Z').getTime();
    const reopenAt = closedAt + 5 * 60_000; // 暫停了5分鐘
    fake.seed('users', [{ id: 'u1', market_open: false, market_closed_at: new Date(closedAt).toISOString() }]);
    fake.seed('market_shelves', [{ id: 1, user_id: 'u1' }]);
    const originalActiveFrom = new Date(closedAt - 60_000).toISOString();
    fake.seed('market_shelf_slots', [
      { id: 100, shelf_id: 1, format_key: 'postcard', design_id: 1, quantity: 10, collected_quantity: 0, active_from: originalActiveFrom, listed_at: originalActiveFrom },
    ]);

    const { error, pausedMs } = await reopenMarket(admin(fake), 'u1', reopenAt);

    expect(error).toBe(false);
    expect(pausedMs).toBe(5 * 60_000);
    const slot = fake.rows('market_shelf_slots')[0];
    expect(new Date(slot.active_from as string).getTime()).toBe(new Date(originalActiveFrom).getTime() + 5 * 60_000);
    const userRow = fake.rows('users')[0];
    expect(userRow.market_open).toBe(true);
    expect(userRow.market_closed_at).toBeNull();
  });

  it('沒有貨架時安全地什麼都不用平移，只切回營業中', async () => {
    const fake = new FakeSupabase();
    const closedAt = new Date('2026-08-03T10:00:00Z').getTime();
    fake.seed('users', [{ id: 'u1', market_open: false, market_closed_at: new Date(closedAt).toISOString() }]);
    fake.seed('market_shelves', []);
    fake.seed('market_shelf_slots', []);

    const { error, pausedMs } = await reopenMarket(admin(fake), 'u1', closedAt + 60_000);

    expect(error).toBe(false);
    expect(pausedMs).toBe(60_000);
    expect(fake.rows('users')[0].market_open).toBe(true);
  });

  it('market_closed_at 是 null（邊界情況）時暫停時長算0，不會平移任何東西', async () => {
    const fake = new FakeSupabase();
    const now = new Date('2026-08-03T10:00:00Z').getTime();
    fake.seed('users', [{ id: 'u1', market_open: false, market_closed_at: null }]);
    fake.seed('market_shelves', [{ id: 1, user_id: 'u1' }]);
    const originalActiveFrom = new Date(now - 60_000).toISOString();
    fake.seed('market_shelf_slots', [
      { id: 101, shelf_id: 1, format_key: 'postcard', design_id: 1, quantity: 10, collected_quantity: 0, active_from: originalActiveFrom, listed_at: originalActiveFrom },
    ]);

    const { pausedMs } = await reopenMarket(admin(fake), 'u1', now);

    expect(pausedMs).toBe(0);
    expect(fake.rows('market_shelf_slots')[0].active_from).toBe(originalActiveFrom);
  });
});
