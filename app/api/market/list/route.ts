import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findFormatByKey } from '@/lib/factory/catalog';
import { computeSlotRemaining } from '@/lib/market/catalog';
import { upsertShelfSlot } from '@/lib/market/listing';
import type { MarketShelfSlot } from '@/types/database';

// 上架：把工廠倉庫裡的庫存移到指定貨架，取代原本工廠倉庫「全部賣掉」的即時收購
// （見 PROJECT_PROGRESS.md 已定案項目 32）。這裡只搬動庫存數量、算好 active_from，
// 不會馬上入帳遊戲幣——賣出是貨架每分鐘自動賣 1 件，實際入帳要玩家之後按「收款」（見 collect 路由）。
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const shelfId = Number(body?.shelfId);
  const formatKey = body?.formatKey;
  const designId = Number(body?.designId);
  const quantity = Number(body?.quantity);

  const format = findFormatByKey(formatKey);
  if (!shelfId || !format || !designId || !quantity || quantity < 1) {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: shelf } = await admin
    .from('market_shelves')
    .select('id, capacity')
    .eq('id', shelfId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!shelf) {
    return NextResponse.json({ error: '找不到這個貨架' }, { status: 400 });
  }

  const { data: existingSlots } = await admin
    .from('market_shelf_slots')
    .select('*')
    .eq('shelf_id', shelfId);
  const slots = (existingSlots ?? []) as MarketShelfSlot[];

  // 貨架容量以「總件數」計算（2026-08-01 修正，見 PROJECT_PROGRESS.md 已定案項目 32）：
  // 已經賣掉的件數不占容量，用 computeSlotRemaining 算「現在實際還在架上的件數」加總，
  // 不是用上架當下的原始 quantity 加總——這樣賣出去的東西會即時空出容量，不用等這批全部
  // 賣完＋收款才釋放空間。
  const now = Date.now();
  const usedCapacity = slots.reduce((sum, s) => sum + computeSlotRemaining(s, now), 0);
  if (usedCapacity + quantity > shelf.capacity) {
    const freeSpace = Math.max(0, shelf.capacity - usedCapacity);
    return NextResponse.json(
      { error: `這個貨架空位不夠（目前還有 ${freeSpace} 件空位），請減少上架數量或先清出空間` },
      { status: 400 }
    );
  }

  const { data: item } = await admin
    .from('factory_inventory_items')
    .select('id, quantity')
    .eq('user_id', user.id)
    .eq('format_key', formatKey)
    .eq('design_id', designId)
    .maybeSingle();
  if (!item || item.quantity < quantity) {
    return NextResponse.json({ error: '倉庫裡沒有這麼多件可以上架' }, { status: 400 });
  }

  // 見 lib/market/listing.ts：如果貨架排在最後面的那個 slot 剛好跟這次要上架的品項一樣，
  // 直接把數量累加上去，不新增一列（避免同款商品被自動補貨機制連續加成一長串重複列）。
  const { error: slotError } = await upsertShelfSlot(admin, { shelfId, formatKey, designId, quantity, now });
  if (slotError) {
    return NextResponse.json({ error: slotError }, { status: 500 });
  }

  const { error: inventoryError } = await admin
    .from('factory_inventory_items')
    .update({ quantity: item.quantity - quantity, updated_at: new Date().toISOString() })
    .eq('id', item.id);
  if (inventoryError) {
    console.error('market list failed to deduct warehouse inventory after slot insert', inventoryError);
  }

  return NextResponse.json({ ok: true });
}
