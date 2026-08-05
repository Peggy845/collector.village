import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertFurnitureSlot } from './listing';
import { FakeSupabase } from '../../test/fakeSupabase';

const MIN = 60 * 1000;

function admin(fake: FakeSupabase): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('upsertFurnitureSlot', () => {
  it('空家具第一次上架：新增一列，從現在開始賣', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture_slots', []);

    const result = await upsertFurnitureSlot(admin(fake), {
      furnitureId: 1,
      formatKey: 'postcard',
      designId: 1,
      quantity: 5,
      now: 1000,
    });

    expect(result.error).toBeUndefined();
    const rows = fake.rows('market_furniture_slots');
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(5);
    expect(rows[0].active_from).toBe(new Date(1000).toISOString());
  });

  it('隊伍尾端是同款商品且還在賣：直接累加數量，不新增一列（避免長串重複列，見 idea/排序太長.png）', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture_slots', [
      {
        id: 1,
        furniture_id: 1,
        format_key: 'postcard',
        design_id: 1,
        quantity: 5,
        collected_quantity: 0,
        active_from: new Date(0).toISOString(),
        listed_at: new Date(0).toISOString(),
      },
    ]);

    const result = await upsertFurnitureSlot(admin(fake), {
      furnitureId: 1,
      formatKey: 'postcard',
      designId: 1,
      quantity: 4,
      now: 2 * MIN,
    });

    expect(result.error).toBeUndefined();
    const rows = fake.rows('market_furniture_slots');
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(9);
    expect(rows[0].active_from).toBe(new Date(0).toISOString());
  });

  it('隊伍尾端是不同商品：新增一列排在它後面，接續它排定的結束時間開賣', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture_slots', [
      {
        id: 1,
        furniture_id: 1,
        format_key: 'postcard',
        design_id: 1,
        quantity: 5,
        collected_quantity: 0,
        active_from: new Date(0).toISOString(),
        listed_at: new Date(0).toISOString(),
      },
    ]);

    const result = await upsertFurnitureSlot(admin(fake), {
      furnitureId: 1,
      formatKey: 'badge',
      designId: 2,
      quantity: 3,
      now: 0,
    });

    expect(result.error).toBeUndefined();
    const rows = fake.rows('market_furniture_slots');
    expect(rows).toHaveLength(2);
    const newRow = rows.find((r) => r.design_id === 2)!;
    expect(newRow.quantity).toBe(3);
    expect(newRow.active_from).toBe(new Date(5 * MIN).toISOString());
  });

  it('已經賣光只是還沒收款的死格子不會被當成隊伍尾端，不會吞掉新上架的庫存（見 idea/又出現.png）', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture_slots', [
      {
        id: 1,
        furniture_id: 1,
        format_key: 'postcard',
        design_id: 1,
        quantity: 5,
        collected_quantity: 0,
        active_from: new Date(0).toISOString(),
        listed_at: new Date(0).toISOString(),
      },
    ]);

    // now 是 10 分鐘後，這個 slot（5 件，1分鐘賣1件）早就賣光了，屬於死格子。
    const result = await upsertFurnitureSlot(admin(fake), {
      furnitureId: 1,
      formatKey: 'postcard',
      designId: 1,
      quantity: 2,
      now: 10 * MIN,
    });

    expect(result.error).toBeUndefined();
    const rows = fake.rows('market_furniture_slots');
    expect(rows).toHaveLength(2);
    const deadSlot = rows.find((r) => r.id === 1)!;
    expect(deadSlot.quantity).toBe(5); // 舊的死格子完全沒被動過
    const newRow = rows.find((r) => r.id !== 1)!;
    expect(newRow.quantity).toBe(2);
    expect(newRow.active_from).toBe(new Date(10 * MIN).toISOString()); // 從現在開始，不繼承死格子的舊排程
  });

  it('兩個 slot 結束時間剛好相同時，用「比較晚才建立」的那個當隊伍尾端，避免隊伍分岔（見 idea/又出現.png）', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture_slots', [
      {
        id: 1,
        furniture_id: 1,
        format_key: 'postcard',
        design_id: 1,
        quantity: 5, // active_from 0 + 5min = 結束於 5min
        collected_quantity: 0,
        active_from: new Date(0).toISOString(),
        listed_at: new Date(100).toISOString(),
      },
      {
        id: 2,
        furniture_id: 1,
        format_key: 'badge',
        design_id: 2,
        quantity: 3, // active_from 2min + 3min = 結束於 5min，跟上面剛好一樣
        collected_quantity: 0,
        active_from: new Date(2 * MIN).toISOString(),
        listed_at: new Date(200).toISOString(), // 比較晚建立
      },
    ]);

    const result = await upsertFurnitureSlot(admin(fake), {
      furnitureId: 1,
      formatKey: 'badge',
      designId: 2,
      quantity: 2,
      now: 0,
    });

    expect(result.error).toBeUndefined();
    const rows = fake.rows('market_furniture_slots');
    expect(rows).toHaveLength(2); // 合併進 slot 2，沒有新增列
    const slot1 = rows.find((r) => r.id === 1)!;
    const slot2 = rows.find((r) => r.id === 2)!;
    expect(slot1.quantity).toBe(5); // 沒被誤選成尾端
    expect(slot2.quantity).toBe(5); // 3 + 2 合併成功
  });

  it('併發時樂觀鎖沒搶到（別人先一步改了 quantity），安全地改成新增一列，不覆蓋別人剛寫入的東西', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture_slots', [
      {
        id: 1,
        furniture_id: 1,
        format_key: 'postcard',
        design_id: 1,
        quantity: 5,
        collected_quantity: 0,
        active_from: new Date(0).toISOString(),
        listed_at: new Date(0).toISOString(),
      },
    ]);
    fake.onceBeforeExecute('market_furniture_slots', 'update', () => {
      const rows = fake.mutableRows('market_furniture_slots');
      (rows[0] as { quantity: number }).quantity = 8; // 模擬另一個請求搶先寫入
    });

    const result = await upsertFurnitureSlot(admin(fake), {
      furnitureId: 1,
      formatKey: 'postcard',
      designId: 1,
      quantity: 3,
      now: 0,
    });

    expect(result.error).toBeUndefined();
    const rows = fake.rows('market_furniture_slots');
    expect(rows).toHaveLength(2);
    expect(rows[0].quantity).toBe(8); // 別人寫入的沒被覆蓋
    expect(rows[1].quantity).toBe(3); // 安全地改成新增一列
  });
});
