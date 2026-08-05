import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/factory/startProduction', () => ({ startProductionBatch: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startProductionBatch } from '@/lib/factory/startProduction';
import { POST } from './route';

vi.mocked(createAdminClient).mockReturnValue({} as never);

function mockAuthedUser(id = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id } } }) },
  } as never);
}

function postWith(body: unknown) {
  return POST(new Request('http://localhost/api/factory/start', { method: 'POST', body: JSON.stringify(body) }));
}

// 實際的排隊/扣幣/寫入邏輯已抽到 lib/factory/startProduction.ts（另有單元測試），
// 這裡只驗證路由層的登入檢查，以及正確把 startProductionBatch 的結果轉成對應的 HTTP 回應。
describe('POST /api/factory/start', () => {
  it('未登入回傳 401', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const res = await postWith({ machineKey: 'printer', formatKey: 'postcard', designId: 1 });
    expect(res.status).toBe(401);
    expect(startProductionBatch).not.toHaveBeenCalled();
  });

  it('startProductionBatch 成功時回傳 readyAt', async () => {
    mockAuthedUser('user-1');
    vi.mocked(startProductionBatch).mockResolvedValue({ ok: true, readyAt: '2026-08-05T00:00:00.000Z' });

    const res = await postWith({ machineKey: 'printer', formatKey: 'postcard', designId: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, readyAt: '2026-08-05T00:00:00.000Z' });
    expect(startProductionBatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-1', machineKey: 'printer', formatKey: 'postcard', designId: 1 })
    );
  });

  it('startProductionBatch 失敗時原樣轉發 error 跟 status', async () => {
    mockAuthedUser('user-1');
    vi.mocked(startProductionBatch).mockResolvedValue({ ok: false, error: '請求格式錯誤', status: 400 });

    const res = await postWith({});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('請求格式錯誤');
  });
});
