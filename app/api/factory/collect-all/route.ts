import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { collectAllReadyBatches } from '@/lib/factory/collect';

// 一鍵收成：把所有「已完成、還沒收成」的生產批次一次收進工廠倉庫（回應 Peggy 提出的需求：
// 機器一多、常常會同時有好幾批完成，逐批按收成很煩）。核心邏輯在 lib/factory/collect.ts
// （見該檔案開頭說明），這裡只管認證。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { collected, skipped } = await collectAllReadyBatches(admin, user.id);
  return NextResponse.json({ ok: true, collected, skipped });
}
