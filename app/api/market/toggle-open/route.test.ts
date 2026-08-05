import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

// 這支路由本身沒有 request body，唯一需要在路由層驗證的是登入檢查——
// 實際的暫停/重新營業時間平移邏輯已經在 lib/market/toggleOpen.test.ts 測過。
describe('POST /api/market/toggle-open', () => {
  it('未登入回傳 401', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('未登入');
  });
});
