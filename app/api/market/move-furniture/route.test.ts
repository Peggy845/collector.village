import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { POST } from './route';

function mockAuthedUser(id = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id } } }) },
  } as never);
}

function postWith(body: unknown) {
  return POST(new Request('http://localhost/api/market/move-furniture', { method: 'POST', body: JSON.stringify(body) }));
}

const validBody = { furnitureId: 1, x: 6, y: 6, facing: 'down' };

describe('POST /api/market/move-furniture', () => {
  it('未登入回傳 401', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const res = await postWith(validBody);
    expect(res.status).toBe(401);
  });

  it('furnitureId 缺漏時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ ...validBody, furnitureId: undefined });
    expect(res.status).toBe(400);
  });

  it('facing 不是 up/down 時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ ...validBody, facing: 'sideways' });
    expect(res.status).toBe(400);
  });

  it('找不到這個家具（不屬於自己或不存在）時回傳 400', async () => {
    mockAuthedUser();
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
      }),
    } as never);

    const res = await postWith(validBody);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('找不到這個家具');
  });
});
