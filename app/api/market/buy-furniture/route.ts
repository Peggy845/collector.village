import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buyFurniture } from '@/lib/market/buyFurniture';
import type { Facing } from '@/types/database';

// 買一個新家具並放置在網格上：驗證放置規則、扣幣、新增 market_furniture 列。核心邏輯在
// lib/market/buyFurniture.ts（見該檔案開頭說明），這裡只管認證跟 request 格式解析。
// 跟工廠 API 一樣全部用 service role 執行，一般角色沒有這幾張表的 insert 權限
// （見 supabase/schema.sql）。
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

  if (typeof furnitureType !== 'string' || !Number.isInteger(x) || !Number.isInteger(y) || (facing !== 'up' && facing !== 'down')) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await buyFurniture(admin, { userId: user.id, furnitureType, x, y, facing });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
