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
  return POST(new Request('http://localhost/api/market/list', { method: 'POST', body: JSON.stringify(body) }));
}

const validBody = { shelfId: 1, formatKey: 'postcard', designId: 1, quantity: 1 };

describe('POST /api/market/list', () => {
  it('未登入回傳 401', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const res = await postWith(validBody);
    expect(res.status).toBe(401);
  });

  it('formatKey 不存在於商品目錄時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ ...validBody, formatKey: 'not-a-real-format' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('請求格式錯誤');
  });

  it('shelfId 缺漏時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ ...validBody, shelfId: undefined });
    expect(res.status).toBe(400);
  });

  it('designId 缺漏時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ ...validBody, designId: undefined });
    expect(res.status).toBe(400);
  });

  it('quantity 小於 1 時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ ...validBody, quantity: 0 });
    expect(res.status).toBe(400);
  });
});
