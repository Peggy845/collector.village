import { describe, expect, it, vi } from 'vitest';

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
    expect(body).toEqual({ readyBatches: 0, shelvesNeedingRestock: 0, warehouseEmpty: false });
  });
});
