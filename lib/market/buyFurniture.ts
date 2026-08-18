import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCurrencyBalance } from '@/lib/supabase/currency';
import { findFurnitureDef } from './furniture';
import { validatePlacement, type FurniturePosition } from './placement';
import type { Facing } from '@/types/database';

// 買家具的核心邏輯，從 app/api/market/buy-furniture/route.ts 抽出來方便寫單元測試
// （見 lib/market/buyFurniture.test.ts），比照 lib/factory/startProduction.ts 同樣的
// { ok: true } | { ok: false; error; status } 回傳型別，路由只負責認證跟request格式解析
// （x/y是不是整數、facing是不是合法值），家具種類存不存在／放置規則／餘額這些業務判斷
// 都搬進這裡，行為跟原本完全一致。
export type BuyFurnitureResult = { ok: true } | { ok: false; error: string; status: number };

export async function buyFurniture(
  admin: SupabaseClient,
  params: { userId: string; furnitureType: string; x: number; y: number; facing: Facing }
): Promise<BuyFurnitureResult> {
  const { userId, furnitureType, x, y, facing } = params;

  const def = findFurnitureDef(furnitureType);
  if (!def) {
    return { ok: false, error: '請求格式錯誤', status: 400 };
  }

  const { data: existingData, error: fetchError } = await admin
    .from('market_furniture')
    .select('grid_x, grid_y, facing')
    .eq('user_id', userId);
  if (fetchError) {
    return { ok: false, error: '買家具失敗，請稍後再試', status: 500 };
  }
  const existing: FurniturePosition[] = (existingData ?? []).map((f) => ({
    x: f.grid_x as number,
    y: f.grid_y as number,
    facing: f.facing as Facing,
  }));

  const placement = validatePlacement(existing, { x, y, facing });
  if (!placement.ok) {
    return { ok: false, error: placement.reason, status: 400 };
  }

  const balance = await fetchCurrencyBalance(admin, userId);
  if (balance < def.cost) {
    return {
      ok: false,
      error: `遊戲幣不足，買一個${def.name}需要 ${def.cost} 枚，目前只有 ${balance} 枚`,
      status: 400,
    };
  }

  const { error: furnitureError } = await admin.from('market_furniture').insert({
    user_id: userId,
    furniture_type: def.type,
    capacity: def.capacity,
    grid_x: x,
    grid_y: y,
    facing,
  });
  if (furnitureError) {
    return { ok: false, error: '買家具失敗，請稍後再試', status: 500 };
  }

  const { error: ledgerError } = await admin.from('game_currency_ledger').insert({
    user_id: userId,
    amount: -def.cost,
    reason: `market_buy_furniture:${def.type}`,
  });
  if (ledgerError) {
    console.error('market furniture ledger deduction failed after furniture insert', ledgerError);
  }

  return { ok: true };
}
