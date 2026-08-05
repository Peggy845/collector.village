import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePlacement, type FurniturePosition } from '@/lib/market/placement';
import type { Facing } from '@/types/database';

// 移動已放置的家具（改位置/朝向）：2026-08-05（空間網格家具擺放系統）新增，讓玩家擺錯位置
// 不會永久卡住。跟 Peggy 確認過 v1 免費、不限次數（不像買家具需要花錢，單純調整佈局）。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const furnitureId = Number(body?.furnitureId);
  const x = Number(body?.x);
  const y = Number(body?.y);
  const facing: Facing = body?.facing;

  if (!furnitureId || !Number.isInteger(x) || !Number.isInteger(y) || (facing !== 'up' && facing !== 'down')) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from('market_furniture')
    .select('id')
    .eq('id', furnitureId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: '找不到這個家具' }, { status: 400 });
  }

  const { data: othersData, error: fetchError } = await admin
    .from('market_furniture')
    .select('grid_x, grid_y, facing')
    .eq('user_id', user.id)
    .neq('id', furnitureId);
  if (fetchError) {
    return NextResponse.json({ error: '移動失敗，請稍後再試' }, { status: 500 });
  }
  const others: FurniturePosition[] = (othersData ?? []).map((f) => ({
    x: f.grid_x as number,
    y: f.grid_y as number,
    facing: f.facing as Facing,
  }));

  const placement = validatePlacement(others, { x, y, facing });
  if (!placement.ok) {
    return NextResponse.json({ error: placement.reason }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from('market_furniture')
    .update({ grid_x: x, grid_y: y, facing })
    .eq('id', furnitureId);
  if (updateError) {
    return NextResponse.json({ error: '移動失敗，請稍後再試' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
