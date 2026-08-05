import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

function mockAuthedUser(id = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id } } }) },
  } as never);
}

function postWith(body: unknown) {
  return POST(new Request('http://localhost/api/factory/collect', { method: 'POST', body: JSON.stringify(body) }));
}

describe('POST /api/factory/collect', () => {
  it('未登入回傳 401', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const res = await postWith({ batchId: 1 });
    expect(res.status).toBe(401);
  });

  it('batchId 缺漏時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('請求格式錯誤');
  });

  it('batchId 是 0 或非數字時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ batchId: 'not-a-number' });
    expect(res.status).toBe(400);
  });

  it('body 不是合法 JSON 時回傳 400', async () => {
    mockAuthedUser();
    const res = await POST(new Request('http://localhost/api/factory/collect', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(400);
  });
});
