import type { SupabaseClient } from '@supabase/supabase-js';
import { computeSlotRemaining } from './catalog';
import { upsertShelfSlot } from './listing';
import type { FactoryInventoryItem, MarketShelf, MarketShelfSlot } from '@/types/database';

// 自動上架模式（見 PROJECT_PROGRESS.md 已定案項目 32 補充）：玩家可以在 /market 切換
// 「手動上架」（預設，維持原本行為：玩家自己上架，賣完就停在那裡，不會自己補貨）
// 或「自動上架」（系統自動把貨架補滿，一路補到工廠倉庫庫存全部上架完為止）。
//
// 跟超市其餘機制一樣，刻意不跑背景排程——這個函式只在「有人正在看畫面」的當下才會被呼叫
// （/market 頁面每次載入、或導覽列每 45 秒輪詢一次通知摘要時），玩家完全沒開網頁的期間
// 不會偷偷動。多次呼叫是安全的：沒有空位或倉庫已經空了就直接不做事。
//
// 實際的「補一筆貨」寫入動作交給 lib/market/listing.ts 的 upsertShelfSlot 處理，它會自動判斷
// 要不要跟貨架最後一個 slot 合併（同款商品連續補貨時不會產生一長串「× 1」的重複列，見
// idea/排序太長.png）。
export async function autoRestockUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: userRow } = await admin
    .from('users')
    .select('market_auto_restock')
    .eq('id', userId)
    .maybeSingle();
  if (!userRow?.market_auto_restock) return;

  const { data: shelvesData } = await admin
    .from('market_shelves')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  const shelves = (shelvesData ?? []) as MarketShelf[];
  if (shelves.length === 0) return;

  const { data: inventoryData } = await admin
    .from('factory_inventory_items')
    .select('*')
    .eq('user_id', userId)
    .gt('quantity', 0)
    .order('id', { ascending: true });
  const inventory = (inventoryData ?? []) as FactoryInventoryItem[];
  if (inventory.length === 0) return;

  const { data: slotsData } = await admin
    .from('market_shelf_slots')
    .select('*')
    .in(
      'shelf_id',
      shelves.map((s) => s.id)
    );
  const slotsByShelf = new Map<number, MarketShelfSlot[]>();
  for (const slot of (slotsData ?? []) as MarketShelfSlot[]) {
    const list = slotsByShelf.get(slot.shelf_id) ?? [];
    list.push(slot);
    slotsByShelf.set(slot.shelf_id, list);
  }

  const now = Date.now();

  for (const shelf of shelves) {
    if (inventory.every((item) => item.quantity <= 0)) break;

    const slots = slotsByShelf.get(shelf.id) ?? [];
    const usedCapacity = slots.reduce((sum, s) => sum + computeSlotRemaining(s, now), 0);
    let freeSpace = Math.max(0, shelf.capacity - usedCapacity);
    if (freeSpace <= 0) continue;

    for (const item of inventory) {
      if (freeSpace <= 0) break;
      if (item.quantity <= 0) continue;

      const quantity = Math.min(item.quantity, freeSpace);
      const { error } = await upsertShelfSlot(admin, {
        shelfId: shelf.id,
        formatKey: item.format_key,
        designId: item.design_id,
        quantity,
        now,
      });
      if (error) continue;

      const { error: updateError } = await admin
        .from('factory_inventory_items')
        .update({ quantity: item.quantity - quantity, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (updateError) continue;

      freeSpace -= quantity;
      item.quantity -= quantity;
    }
  }
}
