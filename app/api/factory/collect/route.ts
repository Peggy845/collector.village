import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { collectBatch } from '@/lib/factory/collect';

// 收成：把生產批次標記為 collected，並把數量疊加進工廠倉庫庫存。核心邏輯在
// lib/factory/collect.ts（見該檔案開頭說明），這裡只管認證跟 request 格式解析。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const batchId = Number(body?.batchId);
  if (!batchId) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await collectBatch(admin, user.id, batchId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, quantity: result.quantity });
}
