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
  return POST(new Request('http://localhost/api/market/buy-furniture', { method: 'POST', body: JSON.stringify(body) }));
}

const validBody = { furnitureType: 'bookshelf', x: 5, y: 5, facing: 'down' };

describe('POST /api/market/buy-furniture', () => {
  it('未登入回傳 401', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const res = await postWith(validBody);
    expect(res.status).toBe(401);
  });

  it('家具種類不存在時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ ...validBody, furnitureType: 'not-a-real-type' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('請求格式錯誤');
  });

  it('facing 不是 up/down 時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ ...validBody, facing: 'left' });
    expect(res.status).toBe(400);
  });

  it('座標缺漏時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ ...validBody, x: undefined });
    expect(res.status).toBe(400);
  });

  it('放置規則不合法時回傳 400（帶具體原因），不會走到餘額檢查', async () => {
    mockAuthedUser();
    // 目標格 (5,5) 已經有家具佔用。
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ grid_x: 5, grid_y: 5, facing: 'down' }] }),
        }),
      }),
    } as never);

    const res = await postWith(validBody);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('這個位置已經有家具了');
  });
});
