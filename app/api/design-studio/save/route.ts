import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidPixelData } from '@/lib/design-studio/palette';
import { fetchDesignLibraryCapacity, fetchPlayerDesignCount } from '@/lib/supabase/design-studio';

// 儲存設計（新增或覆蓋既有設計），見 supabase/schema.sql 第12節、idea/設計坊.png「儲存設計」按鈕。
// 圖片本身（rasterizePixelGrid 渲染出的PNG）由前端直接上傳到 player-designs bucket
// （RLS 限制只能傳到自己 user_id 開頭的路徑），這支 API 只負責容量檢查跟資料表寫入：
//   - player_designs：玩家設計庫正本，覆蓋時原地更新這筆（不佔新的容量格）。
//   - factory_designs：每次存檔都新插入一列（不可變版本快照，見上方schema註解），
//     讓生產鏈（factory_production_batches等）永遠指向存檔當下的那個版本，覆蓋之後
//     不會讓已經生產/上架過的舊商品畫面跟著變。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const pixelData = body?.pixelData;
  const imagePath = typeof body?.imagePath === 'string' ? body.imagePath : '';
  const overwriteId = body?.overwriteId ? Number(body.overwriteId) : null;

  if (!name || !isValidPixelData(pixelData) || !imagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();

  if (overwriteId) {
    const { data: existing } = await admin
      .from('player_designs')
      .select('id')
      .eq('id', overwriteId)
      .eq('user_id', user.id)
      .eq('status', 'library')
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: '找不到要覆蓋的設計' }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('player_designs')
      .update({ name, pixel_data: pixelData, updated_at: new Date().toISOString() })
      .eq('id', overwriteId);
    if (updateError) {
      return NextResponse.json({ error: '儲存失敗，請稍後再試' }, { status: 500 });
    }

    const { data: snapshot, error: snapshotError } = await admin
      .from('factory_designs')
      .insert({ storage_path: imagePath, name, is_active: true, user_id: user.id, player_design_id: overwriteId })
      .select('id')
      .single();
    if (snapshotError) {
      return NextResponse.json({ error: '儲存失敗，請稍後再試' }, { status: 500 });
    }

    await admin.from('player_designs').update({ current_factory_design_id: snapshot.id }).eq('id', overwriteId);

    return NextResponse.json({ ok: true, playerDesignId: overwriteId, factoryDesignId: snapshot.id });
  }

  const [count, capacity] = await Promise.all([
    fetchPlayerDesignCount(admin, user.id),
    fetchDesignLibraryCapacity(admin, user.id),
  ]);
  if (count >= capacity) {
    return NextResponse.json(
      { error: `設計庫已滿（目前 ${count}/${capacity}），請選擇要覆蓋的設計，或放棄這次的畫` },
      { status: 400 }
    );
  }

  const { data: playerDesign, error: insertError } = await admin
    .from('player_designs')
    .insert({ user_id: user.id, name, pixel_data: pixelData, status: 'library' })
    .select('id')
    .single();
  if (insertError) {
    return NextResponse.json({ error: '儲存失敗，請稍後再試' }, { status: 500 });
  }

  const { data: snapshot, error: snapshotError } = await admin
    .from('factory_designs')
    .insert({ storage_path: imagePath, name, is_active: true, user_id: user.id, player_design_id: playerDesign.id })
    .select('id')
    .single();
  if (snapshotError) {
    return NextResponse.json({ error: '儲存失敗，請稍後再試' }, { status: 500 });
  }

  await admin.from('player_designs').update({ current_factory_design_id: snapshot.id }).eq('id', playerDesign.id);

  return NextResponse.json({ ok: true, playerDesignId: playerDesign.id, factoryDesignId: snapshot.id });
}
