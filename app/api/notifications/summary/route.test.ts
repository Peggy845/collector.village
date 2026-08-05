import { describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from '../../../../test/fakeSupabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

// 這支路由刻意用一般登入 client（走 RLS）而非 service role（見路由檔案註解），
// 未登入時不算錯誤，直接回傳全部零值/false 讓導覽列提醒欄安靜下來即可，不用回 401。
describe('GET /api/notifications/summary', () => {
  it('未登入時回傳預設零值，不是 401', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ readyBatches: 0, furnitureNeedingRestock: 0, warehouseEmpty: false });
  });

  it('只有收銀機（純裝飾，capacity 為 null）時不會誤報 furnitureNeedingRestock（2026-08-05 新增）', async () => {
    const fake = new FakeSupabase();
    fake.seed('users', [{ id: 'u1', market_open: true, market_closed_at: null }]);
    fake.seed('market_furniture', [{ id: 1, user_id: 'u1', furniture_type: 'cashier', capacity: null, created_at: new Date(0).toISOString() }]);
    fake.seed('market_furniture_slots', []);
    fake.seed('factory_production_batches', []);
    fake.seed('factory_inventory_items', []);

    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: fake.from.bind(fake),
    } as never);

    const res = await GET();
    const body = await res.json();
    expect(body.furnitureNeedingRestock).toBe(0);
  });
});
