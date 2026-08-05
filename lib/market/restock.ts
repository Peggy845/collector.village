import type { SupabaseClient } from '@supabase/supabase-js';
import { computeSlotRemaining } from './catalog';
import { isFormatAllowedForFurniture } from './furniture';
import { upsertFurnitureSlot } from './listing';
import type { FactoryInventoryItem, MarketFurniture, MarketFurnitureSlot } from '@/types/database';

// 自動上架模式（見 PROJECT_PROGRESS.md 已定案項目 32 補充）：玩家可以在 /market 切換
// 「手動上架」（預設，維持原本行為：玩家自己上架，賣完就停在那裡，不會自己補貨）
// 或「自動上架」（系統自動把家具補滿，一路補到工廠倉庫庫存全部上架完為止）。
//
// 跟超市其餘機制一樣，刻意不跑背景排程——這個函式只在「有人正在看畫面」的當下才會被呼叫
// （/market 頁面每次載入、或導覽列每 45 秒輪詢一次通知摘要時），玩家完全沒開網頁的期間
// 不會偷偷動。多次呼叫是安全的：沒有空位或倉庫已經空了就直接不做事。
//
// 2026-08-05（空間網格家具擺放系統）：每個家具只能放特定商品格式（見 lib/market/furniture.ts），
// 補貨前要先篩掉這個家具不相容的品項，不能盲目塞——收銀機（capacity===null）永遠跳過。
// 不相容的品項會留在倉庫不動，等玩家自己買相容的家具或手動上架到別的家具。
//
// 實際的「補一筆貨」寫入動作交給 lib/market/listing.ts 的 upsertFurnitureSlot 處理，它會自動判斷
// 要不要跟家具最後一個 slot 合併（同款商品連續補貨時不會產生一長串「× 1」的重複列，見
// idea/排序太長.png）。
export async function autoRestockUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: userRow } = await admin
    .from('users')
    .select('market_auto_restock')
    .eq('id', userId)
    .maybeSingle();
  if (!userRow?.market_auto_restock) return;

  const { data: furnitureData } = await admin
    .from('market_furniture')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  const furniture = (furnitureData ?? []) as MarketFurniture[];
  if (furniture.length === 0) return;

  const { data: inventoryData } = await admin
    .from('factory_inventory_items')
    .select('*')
    .eq('user_id', userId)
    .gt('quantity', 0)
    .order('id', { ascending: true });
  const inventory = (inventoryData ?? []) as FactoryInventoryItem[];
  if (inventory.length === 0) return;

  const { data: slotsData } = await admin
    .from('market_furniture_slots')
    .select('*')
    .in(
      'furniture_id',
      furniture.map((f) => f.id)
    );
  const slotsByFurniture = new Map<number, MarketFurnitureSlot[]>();
  for (const slot of (slotsData ?? []) as MarketFurnitureSlot[]) {
    const list = slotsByFurniture.get(slot.furniture_id) ?? [];
    list.push(slot);
    slotsByFurniture.set(slot.furniture_id, list);
  }

  const now = Date.now();

  for (const item of furniture) {
    if (item.capacity === null) continue; // 收銀機：純裝飾，永遠不補貨
    if (inventory.every((row) => row.quantity <= 0)) break;

    const slots = slotsByFurniture.get(item.id) ?? [];
    const usedCapacity = slots.reduce((sum, s) => sum + computeSlotRemaining(s, now), 0);
    let freeSpace = Math.max(0, item.capacity - usedCapacity);
    if (freeSpace <= 0) continue;

    const compatibleInventory = inventory.filter((row) => isFormatAllowedForFurniture(item.furniture_type, row.format_key));

    for (const row of compatibleInventory) {
      if (freeSpace <= 0) break;
      if (row.quantity <= 0) continue;

      const quantity = Math.min(row.quantity, freeSpace);
      const { error } = await upsertFurnitureSlot(admin, {
        furnitureId: item.id,
        formatKey: row.format_key,
        designId: row.design_id,
        quantity,
        now,
      });
      if (error) continue;

      const { error: updateError } = await admin
        .from('factory_inventory_items')
        .update({ quantity: row.quantity - quantity, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateError) continue;

      freeSpace -= quantity;
      row.quantity -= quantity;
    }
  }
}
