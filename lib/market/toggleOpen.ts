import type { SupabaseClient } from '@supabase/supabase-js';

// 暫停/重新營業核心邏輯，從 app/api/market/toggle-open/route.ts 抽出來方便寫單元測試
// （見 lib/market/toggleOpen.test.ts）。重新營業時把「暫停了多久」整批加回使用者名下所有
// market_shelf_slots 的 active_from，讓凍結期間不會被誤算成賣出時間流逝（見該路由檔案
// 開頭的完整說明）。

export async function closeMarket(
  admin: SupabaseClient,
  userId: string,
  now: number = Date.now()
): Promise<{ error: boolean }> {
  const { error } = await admin
    .from('users')
    .update({ market_open: false, market_closed_at: new Date(now).toISOString() })
    .eq('id', userId);
  return { error: Boolean(error) };
}

// 回傳暫停了多久（ms），方便測試驗證平移量是否正確。
export async function reopenMarket(
  admin: SupabaseClient,
  userId: string,
  now: number = Date.now()
): Promise<{ error: boolean; pausedMs: number }> {
  const { data: userRow } = await admin.from('users').select('market_closed_at').eq('id', userId).maybeSingle();
  const closedAt = userRow?.market_closed_at ? new Date(userRow.market_closed_at).getTime() : now;
  const pausedMs = Math.max(0, now - closedAt);

  const { data: shelves } = await admin.from('market_shelves').select('id').eq('user_id', userId);
  const shelfIds = ((shelves ?? []) as { id: number }[]).map((s) => s.id);

  if (shelfIds.length > 0 && pausedMs > 0) {
    const { data: slots } = await admin.from('market_shelf_slots').select('id, active_from').in('shelf_id', shelfIds);
    for (const slot of (slots ?? []) as { id: number; active_from: string }[]) {
      const newActiveFrom = new Date(new Date(slot.active_from).getTime() + pausedMs).toISOString();
      await admin.from('market_shelf_slots').update({ active_from: newActiveFrom }).eq('id', slot.id);
    }
  }

  const { error } = await admin.from('users').update({ market_open: true, market_closed_at: null }).eq('id', userId);
  return { error: Boolean(error), pausedMs };
}
