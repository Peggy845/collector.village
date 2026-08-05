import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCurrencyBalance } from '@/lib/supabase/currency';
import { findFurnitureDef } from '@/lib/market/furniture';
import { validatePlacement, type FurniturePosition } from '@/lib/market/placement';
import type { Facing } from '@/types/database';

// 買一個新家具並放置在網格上：驗證放置規則（見 lib/market/placement.ts）、扣幣、新增
// market_furniture 列。跟工廠 API 一樣全部用 service role 執行，一般角色沒有這幾張表的
// insert 權限（見 supabase/schema.sql）。
//
// 2026-08-05（空間網格家具擺放系統）取代原本的 buy-shelf：不再檢查「家具數量上限」
// （原本的 MAX_SHELVES），改成放置規則本身就是唯一的數量閘門——場地放不下就是放不下。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const furnitureType = body?.furnitureType;
  const x = Number(body?.x);
  const y = Number(body?.y);
  const facing: Facing = body?.facing;

  const def = findFurnitureDef(furnitureType);
  if (!def || !Number.isInteger(x) || !Number.isInteger(y) || (facing !== 'up' && facing !== 'down')) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existingData, error: fetchError } = await admin
    .from('market_furniture')
    .select('grid_x, grid_y, facing')
    .eq('user_id', user.id);
  if (fetchError) {
    return NextResponse.json({ error: '買家具失敗，請稍後再試' }, { status: 500 });
  }
  const existing: FurniturePosition[] = (existingData ?? []).map((f) => ({
    x: f.grid_x as number,
    y: f.grid_y as number,
    facing: f.facing as Facing,
  }));

  const placement = validatePlacement(existing, { x, y, facing });
  if (!placement.ok) {
    return NextResponse.json({ error: placement.reason }, { status: 400 });
  }

  const balance = await fetchCurrencyBalance(admin, user.id);
  if (balance < def.cost) {
    return NextResponse.json(
      { error: `遊戲幣不足，買一個${def.name}需要 ${def.cost} 枚，目前只有 ${balance} 枚` },
      { status: 400 }
    );
  }

  const { error: furnitureError } = await admin.from('market_furniture').insert({
    user_id: user.id,
    furniture_type: def.type,
    capacity: def.capacity,
    grid_x: x,
    grid_y: y,
    facing,
  });
  if (furnitureError) {
    return NextResponse.json({ error: '買家具失敗，請稍後再試' }, { status: 500 });
  }

  const { error: ledgerError } = await admin.from('game_currency_ledger').insert({
    user_id: user.id,
    amount: -def.cost,
    reason: `market_buy_furniture:${def.type}`,
  });
  if (ledgerError) {
    console.error('market furniture ledger deduction failed after furniture insert', ledgerError);
  }

  return NextResponse.json({ ok: true });
}
