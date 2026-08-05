import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { CELL_COUNT } from '@/lib/design-studio/palette';
import { POST } from './route';

function mockAuthedUser(id = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id } } }) },
  } as never);
}

function postWith(body: unknown) {
  return POST(new Request('http://localhost/api/design-studio/save', { method: 'POST', body: JSON.stringify(body) }));
}

const validPixelData = new Array(CELL_COUNT).fill(0);

describe('POST /api/design-studio/save', () => {
  it('未登入回傳 401', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const res = await postWith({ name: '測試', pixelData: validPixelData, imagePath: 'user-1/x.png' });
    expect(res.status).toBe(401);
  });

  it('name 是空字串時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ name: '   ', pixelData: validPixelData, imagePath: 'user-1/x.png' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('請求格式錯誤');
  });

  it('pixelData 格式錯誤時回傳 400', async () => {
    mockAuthedUser();
    const res = await postWith({ name: '測試', pixelData: [1, 2, 3], imagePath: 'user-1/x.png' });
    expect(res.status).toBe(400);
  });

  it('imagePath 不是自己的路徑時回傳 400', async () => {
    mockAuthedUser('user-1');
    const res = await postWith({ name: '測試', pixelData: validPixelData, imagePath: 'other-user/x.png' });
    expect(res.status).toBe(400);
  });
});
