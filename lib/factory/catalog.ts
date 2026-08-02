import type { FormatKey, MachineKey } from '@/types/database';

// 工廠系統 v1 的完整換算表，寫死在這裡（見 PROJECT_PROGRESS.md 已定案項目 31）。
// 這是固定的遊戲規則資料，不需要玩家或管理者透過網頁調整，故意不建資料表。
// 生產時間刻意抓 10~30 分鐘，比真正的工廠遊戲短很多，目的是讓玩家能常常回來看，
// 而不是掛著等好幾小時；各格式投報率抓在 212~233% 左右，讓玩家選格式是看喜好而非賺錢效率。

export interface FactoryFormat {
  key: FormatKey;
  name: string;
  outputQuantity: number;
  sellPricePerUnit: number;
  productionMinutes: number;
}

export interface FactoryMachine {
  key: MachineKey;
  name: string;
  materialName: string;
  materialCost: number;
  formats: FactoryFormat[];
}

// 排隊上限：同一台機器最多同時排 4 批，依序生產，玩家不用每 10~30 分鐘就開一次遊戲
// （見 PROJECT_PROGRESS.md 已定案項目31補充：真正玩家可能上班中，沒辦法那麼頻繁盯著手機）。
export const MAX_QUEUE_PER_MACHINE = 4;

export const FACTORY_MACHINES: FactoryMachine[] = [
  {
    key: 'printer',
    name: '印表機',
    materialName: '紙材',
    materialCost: 30,
    formats: [
      { key: 'poster', name: '海報', outputQuantity: 4, sellPricePerUnit: 25, productionMinutes: 15 },
      { key: 'postcard', name: '明信片', outputQuantity: 10, sellPricePerUnit: 10, productionMinutes: 15 },
      { key: 'card', name: '小卡', outputQuantity: 20, sellPricePerUnit: 5, productionMinutes: 15 },
      { key: 'sticker', name: '貼紙', outputQuantity: 25, sellPricePerUnit: 4, productionMinutes: 15 },
    ],
  },
  {
    key: 'sewing',
    name: '裁縫機',
    materialName: '布料',
    materialCost: 50,
    formats: [
      { key: 'plush', name: '娃娃', outputQuantity: 4, sellPricePerUnit: 40, productionMinutes: 20 },
      { key: 'plush_outfit', name: '娃衣', outputQuantity: 2, sellPricePerUnit: 80, productionMinutes: 20 },
    ],
  },
  {
    key: 'press',
    name: '壓模機',
    materialName: '鐵料',
    materialCost: 60,
    formats: [
      { key: 'badge', name: '徽章', outputQuantity: 12, sellPricePerUnit: 16, productionMinutes: 20 },
      { key: 'keychain', name: '鑰匙圈', outputQuantity: 8, sellPricePerUnit: 24, productionMinutes: 20 },
    ],
  },
  {
    key: 'laser',
    name: '雷雕機',
    materialName: '壓克力板',
    materialCost: 80,
    formats: [
      { key: 'acrylic_stand', name: '壓克力立牌', outputQuantity: 2, sellPricePerUnit: 125, productionMinutes: 30 },
      { key: 'acrylic_charm', name: '壓克力吊飾', outputQuantity: 10, sellPricePerUnit: 25, productionMinutes: 30 },
    ],
  },
];

// 開發測試用生產時間覆寫（2026-08-01，呼應 PROJECT_PROGRESS.md 第10-1項測試策略選項(b)：
// 倒數秒數讀環境變數，本機開發設短、正式站設定為真實時長，兩邊跑同一套程式碼只有設定值不同）。
// 只在 .env.local 設定 FACTORY_DEV_PRODUCTION_MINUTES 時生效；Vercel 正式站沒有這個變數，
// 不會被意外影響到，千萬不要把這個變數加進 Vercel 的環境變數設定。
const devProductionMinutesOverride = process.env.FACTORY_DEV_PRODUCTION_MINUTES
  ? Number(process.env.FACTORY_DEV_PRODUCTION_MINUTES)
  : null;

if (devProductionMinutesOverride) {
  for (const machine of FACTORY_MACHINES) {
    for (const format of machine.formats) {
      format.productionMinutes = devProductionMinutesOverride;
    }
  }
}

// ⚠️⚠️⚠️ 暫時性設定，2026-08-01 加入，測完就要刪掉這一整塊 ⚠️⚠️⚠️
// Peggy 要去另一台電腦測試正式站（沒辦法用只在本機生效的 FACTORY_DEV_PRODUCTION_MINUTES），
// 所以直接把「正式站的真實數值」也暫時改成 1 分鐘，這行會影響**所有訪問正式網站的人**，
// 不是只有 Peggy 自己——目前網站沒有其他真實玩家在用，風險可接受，但務必記得測完就刪掉這段，
// 讓生產時間恢復成上面 FACTORY_MACHINES 裡寫的真實數值（15~30分鐘）。
for (const machine of FACTORY_MACHINES) {
  for (const format of machine.formats) {
    format.productionMinutes = 1;
  }
}

// 新排一批生產要接在佇列最後一批之後才開始算時間；如果佇列最後一批其實已經到時間了（玩家還沒
// 收成，但排程上早就跑完了），新的一批改成從現在開始算，不會平白繼承一段早就過去的等待時間
// （見 app/api/factory/start/route.ts）。抽成獨立函式方便寫單元測試，邏輯本身不依賴資料庫。
export function computeQueuedBatchReadyAt(
  latestQueuedReadyAtIso: string | null,
  now: number,
  productionMinutes: number
): string {
  const lastReadyAt = latestQueuedReadyAtIso ? new Date(latestQueuedReadyAtIso).getTime() : now;
  const startFrom = Math.max(now, lastReadyAt);
  return new Date(startFrom + productionMinutes * 60 * 1000).toISOString();
}

export function findMachine(machineKey: string): FactoryMachine | undefined {
  return FACTORY_MACHINES.find((m) => m.key === machineKey);
}

export function findFormat(machineKey: string, formatKey: string): FactoryFormat | undefined {
  return findMachine(machineKey)?.formats.find((f) => f.key === formatKey);
}

export function findFormatByKey(formatKey: string): FactoryFormat | undefined {
  for (const machine of FACTORY_MACHINES) {
    const format = machine.formats.find((f) => f.key === formatKey);
    if (format) return format;
  }
  return undefined;
}
