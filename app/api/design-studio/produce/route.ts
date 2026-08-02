import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidPixelData } from '@/lib/design-studio/palette';

// 「直接生產」：玩家不想存進設計庫，只想畫完馬上拿去用（見 idea/設計坊.png）。
// 這裡只負責建立一筆 status='temp' 的暫存設計快照（不算進設計庫容量、不會顯示在「查看設計庫」），
// 機台/格式選擇沿用工廠頁既有的選圖器完成（見 2026-08-02 跟 Peggy 確認的動線：導去
// /factory?designId=... 帶著這張暫存設計過去，不在設計坊頁面另外做一套機台選擇）。
// 暫存設計的底層資料不會真的被刪除，會一直保留到這批生產的商品做完且賣完為止
// （見 supabase/schema.sql 第12節 player_designs.status 說明，2026-08-02 跟 Peggy 確認過的規則）。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : '未命名設計';
  const pixelData = body?.pixelData;
  const imagePath = typeof body?.imagePath === 'string' ? body.imagePath : '';

  if (!isValidPixelData(pixelData) || !imagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: playerDesign, error: insertError } = await admin
    .from('player_designs')
    .insert({ user_id: user.id, name, pixel_data: pixelData, status: 'temp' })
    .select('id')
    .single();
  if (insertError) {
    return NextResponse.json({ error: '準備失敗，請稍後再試' }, { status: 500 });
  }

  const { data: snapshot, error: snapshotError } = await admin
    .from('factory_designs')
    .insert({ storage_path: imagePath, name, is_active: true, user_id: user.id, player_design_id: playerDesign.id })
    .select('id')
    .single();
  if (snapshotError) {
    return NextResponse.json({ error: '準備失敗，請稍後再試' }, { status: 500 });
  }

  await admin.from('player_designs').update({ current_factory_design_id: snapshot.id }).eq('id', playerDesign.id);

  return NextResponse.json({ ok: true, factoryDesignId: snapshot.id });
}
