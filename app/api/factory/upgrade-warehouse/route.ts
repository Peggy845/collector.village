import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { upgradeWarehouse } from '@/lib/factory/upgradeWarehouse';

// 升級工廠倉庫容量上限（見 PROJECT_PROGRESS.md 已定案項目 32：倉庫容量上限＋付費升級，
// 是促成「工廠↔超市」資源循環的關鍵機制）。核心邏輯在 lib/factory/upgradeWarehouse.ts，
// 這裡只管認證。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await upgradeWarehouse(admin, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, newCapacity: result.newCapacity });
}
