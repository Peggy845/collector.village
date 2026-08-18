import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buyFurniture } from './buyFurniture';
import { FakeSupabase } from '../../test/fakeSupabase';

function admin(fake: FakeSupabase): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('buyFurniture', () => {
  it('未知的家具種類 -> 400 請求格式錯誤，不查資料庫其他表', async () => {
    const fake = new FakeSupabase();
    const result = await buyFurniture(admin(fake), { userId: 'u1', furnitureType: 'not-a-real-type', x: 5, y: 5, facing: 'down' });
    expect(result).toEqual({ ok: false, error: '請求格式錯誤', status: 400 });
  });

  it('座標超出場地範圍 -> 400，帶放置規則本身的錯誤訊息，不查餘額', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture', []);
    const result = await buyFurniture(admin(fake), { userId: 'u1', furnitureType: 'bookshelf', x: 999, y: 5, facing: 'down' });
    expect(result).toEqual({ ok: false, error: '座標超出場地範圍', status: 400 });
  });

  it('位置已經有家具 -> 400，帶放置規則的錯誤訊息', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture', [{ user_id: 'u1', grid_x: 5, grid_y: 5, facing: 'down' }]);
    const result = await buyFurniture(admin(fake), { userId: 'u1', furnitureType: 'bookshelf', x: 5, y: 5, facing: 'down' });
    expect(result).toEqual({ ok: false, error: '這個位置已經有家具了', status: 400 });
  });

  it('遊戲幣不足 -> 400，帶正確的家具名稱/價格/目前餘額，不會真的insert', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture', []);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 100 }]); // 書櫃要150，只有100

    const result = await buyFurniture(admin(fake), { userId: 'u1', furnitureType: 'bookshelf', x: 5, y: 5, facing: 'down' });

    expect(result).toEqual({ ok: false, error: '遊戲幣不足，買一個書櫃需要 150 枚，目前只有 100 枚', status: 400 });
    expect(fake.rows('market_furniture')).toHaveLength(0);
  });

  it('成功：正確扣幣、正確insert家具列（含容量/座標/朝向）、帳本reason格式正確', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture', []);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 200 }]);

    const result = await buyFurniture(admin(fake), { userId: 'u1', furnitureType: 'bookshelf', x: 5, y: 5, facing: 'down' });

    expect(result).toEqual({ ok: true });
    const furniture = fake.rows('market_furniture');
    expect(furniture).toHaveLength(1);
    expect(furniture[0]).toMatchObject({
      user_id: 'u1',
      furniture_type: 'bookshelf',
      capacity: 10,
      grid_x: 5,
      grid_y: 5,
      facing: 'down',
    });
    const ledger = fake.rows('game_currency_ledger');
    expect(ledger).toHaveLength(2);
    expect(ledger[1]).toMatchObject({ user_id: 'u1', amount: -150, reason: 'market_buy_furniture:bookshelf' });
  });

  it('純裝飾家具（收銀機）capacity存null，價格用自己的80枚而不是預設值', async () => {
    const fake = new FakeSupabase();
    fake.seed('market_furniture', []);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 80 }]);

    const result = await buyFurniture(admin(fake), { userId: 'u1', furnitureType: 'cashier', x: 5, y: 5, facing: 'down' });

    expect(result).toEqual({ ok: true });
    expect(fake.rows('market_furniture')[0]).toMatchObject({ furniture_type: 'cashier', capacity: null });
  });

  it('新家具的展示面擋住既有家具的展示面 -> 400，帶放置規則的錯誤訊息', async () => {
    const fake = new FakeSupabase();
    // 既有家具在(5,5)朝下，淨空格是(5,6)；想在(5,6)朝上放新家具會佔用那個淨空格
    fake.seed('market_furniture', [{ user_id: 'u1', grid_x: 5, grid_y: 5, facing: 'down' }]);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 1000 }]);

    const result = await buyFurniture(admin(fake), { userId: 'u1', furnitureType: 'bookshelf', x: 5, y: 6, facing: 'up' });

    expect(result).toEqual({ ok: false, error: '這個位置擋住了旁邊家具的展示面，前方需要淨空', status: 400 });
  });
});
