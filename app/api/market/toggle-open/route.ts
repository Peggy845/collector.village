import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// 切換超市「營業中／暫停營業」（見 PROJECT_PROGRESS.md 已定案項目 32）。
// 暫停：記下 market_closed_at，讀取畫面時會用這個時間點當作「凍結的現在」，倒數不再前進。
// 重新營業：把「暫停了多久」整批加回使用者名下所有 market_shelf_slots 的 active_from，
// 讓凍結期間不會被誤算成「賣出時間流逝了」——這樣讀取端完全不用知道市場開關狀態，
// 唯一需要特殊處理的只有「暫停中」畫面顯示要用凍結時間而非真實現在（見 ShelfCard.tsx）。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from('users')
    .select('market_open, market_closed_at')
    .eq('id', user.id)
    .maybeSingle();

  const isOpen = userRow?.market_open ?? true;

  if (isOpen) {
    const { error } = await admin
      .from('users')
      .update({ market_open: false, market_closed_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) {
      return NextResponse.json({ error: '暫停營業失敗，請稍後再試' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, open: false });
  }

  const closedAt = userRow?.market_closed_at ? new Date(userRow.market_closed_at).getTime() : Date.now();
  const pausedMs = Math.max(0, Date.now() - closedAt);

  const { data: shelves } = await admin.from('market_shelves').select('id').eq('user_id', user.id);
  const shelfIds = (shelves ?? []).map((s) => s.id);

  if (shelfIds.length > 0 && pausedMs > 0) {
    const { data: slots } = await admin
      .from('market_shelf_slots')
      .select('id, active_from')
      .in('shelf_id', shelfIds);
    for (const slot of slots ?? []) {
      const newActiveFrom = new Date(new Date(slot.active_from).getTime() + pausedMs).toISOString();
      await admin.from('market_shelf_slots').update({ active_from: newActiveFrom }).eq('id', slot.id);
    }
  }

  const { error } = await admin
    .from('users')
    .update({ market_open: true, market_closed_at: null })
    .eq('id', user.id);
  if (error) {
    return NextResponse.json({ error: '重新營業失敗，請稍後再試' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, open: true });
}
