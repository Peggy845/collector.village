import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startProductionBatch } from '@/lib/factory/startProduction';

// 開始生產：把一批新工作排進機台的生產佇列（見 PROJECT_PROGRESS.md 已定案項目31補充：
// 同一台機器可以同時排最多 MAX_QUEUE_PER_MACHINE 批，依序生產，玩家不用每 10~30 分鐘就開一次遊戲）。
// 全部用 service role 執行，一般角色沒有這張表的 insert 權限（見 supabase/schema.sql），
// 避免玩家繞過這支 API 直接竄改遊戲幣或生產數量。
// 實際的排隊/扣幣/寫入邏輯抽到 lib/factory/startProduction.ts，跟設計坊「直接生產」共用。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const machineKey = body?.machineKey;
  const formatKey = body?.formatKey;
  const designId = Number(body?.designId);

  const admin = createAdminClient();
  const result = await startProductionBatch(admin, { userId: user.id, machineKey, formatKey, designId });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, readyAt: result.readyAt });
}
