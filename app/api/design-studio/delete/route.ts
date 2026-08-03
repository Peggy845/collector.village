import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchDesignIdsStillInUse } from '@/lib/supabase/factory';

// 刪除設計庫裡的一張或多張設計（見「查看設計庫」勾選刪除）。只能刪自己 status='library' 的設計，
// 且該設計目前若還在生產中／工廠倉庫／超市貨架（任一 factory_designs 快照被引用），就先擋下來，
// 不然已經生產/上架過的商品會找不到縮圖（見 lib/supabase/factory.ts fetchDesignIdsStillInUse 註解）。
// 確認沒人在用之後：刪掉 player_designs 正本，並把它名下所有 factory_designs 快照關成 is_active=false
// （快照本身不刪，萬一之後真的要查歷史還留著，但不會再出現在「選圖」清單裡）。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id)) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: ownDesigns, error: ownDesignsError } = await admin
    .from('player_designs')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'library')
    .in('id', ids);
  if (ownDesignsError) {
    return NextResponse.json({ error: '刪除失敗，請稍後再試' }, { status: 500 });
  }
  const ownIds = (ownDesigns ?? []).map((d) => d.id as number);
  if (ownIds.length === 0) {
    return NextResponse.json({ deleted: [], blocked: [] });
  }

  const { data: snapshots, error: snapshotsError } = await admin
    .from('factory_designs')
    .select('id, player_design_id')
    .in('player_design_id', ownIds);
  if (snapshotsError) {
    return NextResponse.json({ error: '刪除失敗，請稍後再試' }, { status: 500 });
  }
  const snapshotIds = (snapshots ?? []).map((s) => s.id as number);

  const stillInUse = await fetchDesignIdsStillInUse(admin, user.id, snapshotIds);
  const blockedPlayerDesignIds = new Set(
    (snapshots ?? []).filter((s) => stillInUse.has(s.id as number)).map((s) => s.player_design_id as number)
  );

  const deletableIds = ownIds.filter((id) => !blockedPlayerDesignIds.has(id));
  const blockedIds = ownIds.filter((id) => blockedPlayerDesignIds.has(id));

  if (deletableIds.length > 0) {
    const deletableSnapshotIds = (snapshots ?? [])
      .filter((s) => deletableIds.includes(s.player_design_id as number))
      .map((s) => s.id as number);

    if (deletableSnapshotIds.length > 0) {
      await admin.from('factory_designs').update({ is_active: false }).in('id', deletableSnapshotIds);
    }
    await admin.from('player_designs').delete().in('id', deletableIds);
  }

  return NextResponse.json({ deleted: deletableIds, blocked: blockedIds });
}
