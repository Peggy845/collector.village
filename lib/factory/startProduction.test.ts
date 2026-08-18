import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startProductionBatch } from './startProduction';
import { findFormat, MAX_QUEUE_PER_MACHINE } from './catalog';
import { FakeSupabase } from '../../test/fakeSupabase';

function admin(fake: FakeSupabase): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

const NOW = new Date('2026-08-18T00:00:00Z').getTime();
// 不寫死15/20/30分鐘：catalog.ts目前有個「測完要刪掉」的暫時覆寫把所有格式都改成1分鐘
// （見該檔案第89~98行），直接讀真實設定值，這樣不管那段暫時覆寫還在不在，測試都不會錯。
const POSTER_MINUTES = findFormat('printer', 'poster')!.productionMinutes;

function baseParams(overrides?: Partial<{ userId: string; machineKey: string; formatKey: string; designId: number }>) {
  return { userId: 'u1', machineKey: 'printer', formatKey: 'poster', designId: 1, ...overrides };
}

describe('startProductionBatch', () => {
  it('不存在的機器 -> 400 請求格式錯誤，不查資料庫', async () => {
    const fake = new FakeSupabase();
    const result = await startProductionBatch(admin(fake), baseParams({ machineKey: 'not-a-machine' }), NOW);
    expect(result).toEqual({ ok: false, error: '請求格式錯誤', status: 400 });
  });

  it('機器存在但格式不屬於這台機器 -> 400 請求格式錯誤', async () => {
    const fake = new FakeSupabase();
    const result = await startProductionBatch(admin(fake), baseParams({ machineKey: 'printer', formatKey: 'plush' }), NOW);
    expect(result).toEqual({ ok: false, error: '請求格式錯誤', status: 400 });
  });

  it('designId是0（falsy） -> 400 請求格式錯誤', async () => {
    const fake = new FakeSupabase();
    const result = await startProductionBatch(admin(fake), baseParams({ designId: 0 }), NOW);
    expect(result).toEqual({ ok: false, error: '請求格式錯誤', status: 400 });
  });

  it('設計圖不存在 -> 400 找不到這張設計圖', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', []);
    const result = await startProductionBatch(admin(fake), baseParams(), NOW);
    expect(result).toEqual({ ok: false, error: '找不到這張設計圖', status: 400 });
  });

  it('設計圖is_active=false -> 400 找不到這張設計圖（查詢條件本身就濾掉）', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: null, is_active: false }]);
    const result = await startProductionBatch(admin(fake), baseParams(), NOW);
    expect(result).toEqual({ ok: false, error: '找不到這張設計圖', status: 400 });
  });

  it('設計圖是別人自畫的（user_id不是null也不是自己） -> 400 找不到這張設計圖', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: 'someone-else', is_active: true }]);
    const result = await startProductionBatch(admin(fake), baseParams(), NOW);
    expect(result).toEqual({ ok: false, error: '找不到這張設計圖', status: 400 });
  });

  it('排隊已滿（同一台機器已有MAX_QUEUE_PER_MACHINE批in_progress） -> 400，不查餘額不insert', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: null, is_active: true }]);
    fake.seed(
      'factory_production_batches',
      Array.from({ length: MAX_QUEUE_PER_MACHINE }, (_, i) => ({
        id: i + 1,
        user_id: 'u1',
        machine_key: 'printer',
        status: 'in_progress',
        ready_at: new Date(NOW + (i + 1) * 60_000).toISOString(),
      }))
    );

    const result = await startProductionBatch(admin(fake), baseParams(), NOW);

    expect(result).toEqual({
      ok: false,
      error: `這台機器排隊已滿（最多同時排 ${MAX_QUEUE_PER_MACHINE} 批），請等前面收成後再排`,
      status: 400,
    });
    expect(fake.rows('factory_production_batches')).toHaveLength(MAX_QUEUE_PER_MACHINE);
  });

  it('別台機器排滿不影響這台機器（排隊上限是per-machine，不是全域）', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: null, is_active: true }]);
    fake.seed(
      'factory_production_batches',
      Array.from({ length: MAX_QUEUE_PER_MACHINE }, (_, i) => ({
        id: i + 1,
        user_id: 'u1',
        machine_key: 'sewing', // 別台機器排滿
        status: 'in_progress',
        ready_at: new Date(NOW + (i + 1) * 60_000).toISOString(),
      }))
    );
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 1000 }]);

    const result = await startProductionBatch(admin(fake), baseParams({ machineKey: 'printer' }), NOW);

    expect(result.ok).toBe(true);
  });

  it('遊戲幣不足 -> 400，帶正確材料費/目前餘額，不會insert', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: null, is_active: true }]);
    fake.seed('factory_production_batches', []);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 10 }]); // 印表機材料費30，只有10

    const result = await startProductionBatch(admin(fake), baseParams(), NOW);

    expect(result).toEqual({ ok: false, error: '遊戲幣不足，需要 30 枚，目前只有 10 枚', status: 400 });
    expect(fake.rows('factory_production_batches')).toHaveLength(0);
  });

  it('成功（管理員圖庫，user_id為null）：沒有既有排隊時從now開始算readyAt', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: null, is_active: true }]);
    fake.seed('factory_production_batches', []);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 1000 }]);

    const result = await startProductionBatch(admin(fake), baseParams(), NOW);

    expect(result).toEqual({ ok: true, readyAt: new Date(NOW + POSTER_MINUTES * 60_000).toISOString() });
    const batches = fake.rows('factory_production_batches');
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      user_id: 'u1',
      machine_key: 'printer',
      format_key: 'poster',
      design_id: 1,
      quantity: findFormat('printer', 'poster')!.outputQuantity,
      material_cost: 30,
      status: 'in_progress',
    });
    const ledger = fake.rows('game_currency_ledger');
    expect(ledger[1]).toMatchObject({ user_id: 'u1', amount: -30, reason: 'factory_start:machine=printer;format=poster' });
  });

  it('成功（自己畫的設計圖，user_id是自己）：有既有排隊時接在最晚那批之後算readyAt', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 2, user_id: 'u1', is_active: true }]);
    const latestReadyAt = new Date(NOW + 10 * 60_000).toISOString();
    fake.seed('factory_production_batches', [
      { id: 1, user_id: 'u1', machine_key: 'printer', status: 'in_progress', ready_at: new Date(NOW + 3 * 60_000).toISOString() },
      { id: 2, user_id: 'u1', machine_key: 'printer', status: 'in_progress', ready_at: latestReadyAt },
    ]);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 1000 }]);

    const result = await startProductionBatch(admin(fake), baseParams({ designId: 2 }), NOW);

    expect(result).toEqual({
      ok: true,
      readyAt: new Date(new Date(latestReadyAt).getTime() + POSTER_MINUTES * 60_000).toISOString(),
    });
  });

  it('已收成過的批次不算進排隊佇列（status不是in_progress的不擋、不影響接續時間）', async () => {
    const fake = new FakeSupabase();
    fake.seed('factory_designs', [{ id: 1, user_id: null, is_active: true }]);
    fake.seed('factory_production_batches', [
      { id: 1, user_id: 'u1', machine_key: 'printer', status: 'collected', ready_at: new Date(NOW + 99 * 60_000).toISOString() },
    ]);
    fake.seed('game_currency_ledger', [{ user_id: 'u1', amount: 1000 }]);

    const result = await startProductionBatch(admin(fake), baseParams(), NOW);

    expect(result).toEqual({ ok: true, readyAt: new Date(NOW + POSTER_MINUTES * 60_000).toISOString() });
  });
});
