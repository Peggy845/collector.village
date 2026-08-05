import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactoryDesign, FactoryInventoryItem, FactoryProductionBatch, MarketFurnitureSlot } from '@/types/database';
import { computeSlotRemaining } from '@/lib/market/catalog';

// 管理員全站圖庫（user_id為null）＋自己在設計坊畫的（user_id等於自己）都要看得到，
// 但不能看到別人自畫的設計（見 supabase/schema.sql 第12節 RLS 說明）。
//
// 「直接生產」建立的暫存設計（player_designs.status='temp'）刻意不會被刪除（見
// app/api/design-studio/produce/route.ts 註解），但一旦這批商品全部收成+賣完，
// 底層資料就不再有任何地方引用它，這時應該從「選圖」清單消失，不然會像 idea/bug_1.png
// 回報的那樣，賣完很久了選圖清單還是留著那張圖（2026-08-03 Peggy 回報）。
// 「賣完」不等玩家按「入帳」——貨架格子一旦賣完就不會再顯示在 /market（見 ShelfCard 已售完
// 隱藏的邏輯），入帳只是把錢轉成遊戲幣的動作，跟這張圖還用不用得到是兩件事
// （2026-08-03 跟 Peggy 確認過的判斷標準）。
export async function fetchFactoryDesigns(supabase: SupabaseClient, userId: string): Promise<FactoryDesign[]> {
  const { data, error } = await supabase
    .from('factory_designs')
    .select('*')
    .eq('is_active', true)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const designs = (data ?? []) as FactoryDesign[];

  const playerDesignIds = [...new Set(designs.map((d) => d.player_design_id).filter((id): id is number => id != null))];
  if (playerDesignIds.length === 0) return designs;

  const { data: playerDesigns, error: playerDesignsError } = await supabase
    .from('player_designs')
    .select('id, status')
    .in('id', playerDesignIds);
  if (playerDesignsError) throw playerDesignsError;

  const tempPlayerDesignIds = new Set(
    (playerDesigns ?? []).filter((p) => p.status === 'temp').map((p) => p.id as number)
  );
  if (tempPlayerDesignIds.size === 0) return designs;

  const tempDesignIds = designs
    .filter((d) => d.player_design_id != null && tempPlayerDesignIds.has(d.player_design_id))
    .map((d) => d.id);

  const stillInUse = await fetchDesignIdsStillInUse(supabase, userId, tempDesignIds);

  return designs.filter(
    (d) => !(d.player_design_id != null && tempPlayerDesignIds.has(d.player_design_id) && !stillInUse.has(d.id))
  );
}

// 判斷一批 factory_designs.id 是否還「在使用中」：正在生產排隊、躺在工廠倉庫、或貨架上還有沒賣完的
// （用 computeSlotRemaining 算實際剩餘，不是看 slot 這筆資料還在不在——賣完但還沒入帳的 slot
// 不算在使用中，見上方檔案註解）。三個都沒有才算真正用完。
// 也給刪除設計庫（app/api/design-studio/delete）共用：正在使用中的設計不給刪，避免已生產/上架
// 商品的縮圖跟著消失。
export async function fetchDesignIdsStillInUse(
  supabase: SupabaseClient,
  userId: string,
  designIds: number[]
): Promise<Set<number>> {
  const inUse = new Set<number>();
  if (designIds.length === 0) return inUse;

  const { data: batches } = await supabase
    .from('factory_production_batches')
    .select('design_id')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .in('design_id', designIds);
  for (const row of batches ?? []) inUse.add(row.design_id);

  const { data: inventory } = await supabase
    .from('factory_inventory_items')
    .select('design_id')
    .eq('user_id', userId)
    .gt('quantity', 0)
    .in('design_id', designIds);
  for (const row of inventory ?? []) inUse.add(row.design_id);

  const { data: furniture } = await supabase.from('market_furniture').select('id').eq('user_id', userId);
  const furnitureIds = (furniture ?? []).map((f) => f.id);
  if (furnitureIds.length > 0) {
    const { data: slots } = await supabase
      .from('market_furniture_slots')
      .select('*')
      .in('furniture_id', furnitureIds)
      .in('design_id', designIds);
    const now = Date.now();
    for (const row of (slots ?? []) as MarketFurnitureSlot[]) {
      if (computeSlotRemaining(row, now) > 0) inUse.add(row.design_id);
    }
  }

  return inUse;
}

export async function fetchActiveProductionBatches(
  supabase: SupabaseClient,
  userId: string
): Promise<FactoryProductionBatch[]> {
  const { data, error } = await supabase
    .from('factory_production_batches')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress');
  if (error) throw error;
  return (data ?? []) as FactoryProductionBatch[];
}

export async function fetchInventory(
  supabase: SupabaseClient,
  userId: string
): Promise<FactoryInventoryItem[]> {
  const { data, error } = await supabase
    .from('factory_inventory_items')
    .select('*')
    .eq('user_id', userId)
    .gt('quantity', 0);
  if (error) throw error;
  return (data ?? []) as FactoryInventoryItem[];
}

// 管理員圖庫的圖存在 factory-designs bucket；玩家自畫的設計圖存在另一個 player-designs bucket
// （見 lib/supabase/design-studio.ts、supabase/schema.sql 第12節），呼叫端依 design.user_id
// 是否有值決定要組哪個 bucket 的網址（見 components/factory/DesignThumb.tsx）。
export function getFactoryDesignUrl(storagePath: string, bucket: 'factory-designs' | 'player-designs' = 'factory-designs'): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
}
