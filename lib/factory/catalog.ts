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
