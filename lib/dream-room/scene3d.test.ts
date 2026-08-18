import { describe, expect, it } from 'vitest';
import {
  computeTierYBase,
  computeBinLayout,
  binCellFromPoint,
  binCellCenterWorld,
  tierItemPositions,
  computeInsertIndex,
} from './scene3d';
import type { BinDef, TierDef, TierState } from './furniture';
import type { RoomItem } from './roomItems';

function itemsById(items: RoomItem[]): Record<string, RoomItem> {
  return Object.fromEntries(items.map((i) => [i.id, i]));
}

describe('computeTierYBase', () => {
  it('index愈大排愈下面（y=0），由下往上疊，每層之間加上gap', () => {
    const tiers: TierDef[] = [
      { index: 0, usableWidthCm: 50, clearanceHeightCm: 16, usableDepthCm: 15 }, // 最上層
      { index: 1, usableWidthCm: 60, clearanceHeightCm: 20, usableDepthCm: 18 },
      { index: 2, usableWidthCm: 55, clearanceHeightCm: 26, usableDepthCm: 20 }, // 最下層
    ];
    const yBase = computeTierYBase(tiers, 3);
    expect(yBase[2]).toBe(0); // 最下層從地板開始
    expect(yBase[1]).toBe(26 + 3); // 疊在index2上面：index2高度26 + 間距3
    expect(yBase[0]).toBe(26 + 3 + 20 + 3); // 再疊在index1上面：index1高度20 + 間距3
  });

  it('只有一層時y起點是0', () => {
    const tiers: TierDef[] = [{ index: 0, usableWidthCm: 50, clearanceHeightCm: 16, usableDepthCm: 15 }];
    expect(computeTierYBase(tiers, 3)).toEqual({ 0: 0 });
  });
});

describe('computeBinLayout', () => {
  it('寬高正確等於欄列數乘格子尺寸', () => {
    const bin: BinDef = { cols: 4, rows: 3, cellWidthCm: 12, cellHeightCm: 12, depthCm: 15 };
    const layout = computeBinLayout(100, bin, 30);
    expect(layout.width).toBe(48);
    expect(layout.height).toBe(36);
  });

  it('centerX是書櫃最大寬度一半+場景間距+堆疊箱寬度一半，left是centerX減半個寬度', () => {
    const bin: BinDef = { cols: 4, rows: 3, cellWidthCm: 12, cellHeightCm: 12, depthCm: 15 };
    const layout = computeBinLayout(100, bin, 30);
    // centerX = 100/2 + 30 + 48/2 = 50+30+24 = 104
    expect(layout.centerX).toBe(104);
    expect(layout.left).toBe(104 - 24); // 80
  });
});

describe('binCellFromPoint / binCellCenterWorld（同一套錨點規則的一對反函式）', () => {
  const bin: BinDef = { cols: 4, rows: 3, cellWidthCm: 12, cellHeightCm: 12, depthCm: 15 };
  const layout = computeBinLayout(0, bin, 0); // left=0, height=36，方便算

  it('binCellFromPoint：左上角原點(left,height)對應(col:0,row:0)', () => {
    expect(binCellFromPoint(layout, layout.left, layout.height)).toEqual({ col: 0, row: 0 });
  });

  it('binCellFromPoint：row往下數（y愈小row愈大），col往右數（x愈大col愈大）', () => {
    expect(binCellFromPoint(layout, layout.left + 13, layout.height - 13)).toEqual({ col: 1, row: 1 });
  });

  it('binCellCenterWorld：錨點是格子左上角，娃娃實際尺寸的一半才是中心，不是固定格子中心', () => {
    // (0,0)格左上角是(left, height)；一隻14x18的娃娃中心應該落在left+7、height-9
    const item = { realWidthCm: 14, realHeightCm: 18 };
    const { x, y } = binCellCenterWorld(layout, 0, 0, item);
    expect(x).toBe(layout.left + 7);
    expect(y).toBe(layout.height - 9);
  });

  it('binCellCenterWorld：不同娃娃尺寸即使放在同一格，中心點也不同（跟格子本身的尺寸無關）', () => {
    const small = binCellCenterWorld(layout, 1, 0, { realWidthCm: 6, realHeightCm: 6 });
    const big = binCellCenterWorld(layout, 1, 0, { realWidthCm: 20, realHeightCm: 20 });
    expect(small.x).not.toBe(big.x);
    expect(small.y).not.toBe(big.y);
  });
});

describe('tierItemPositions', () => {
  const tier: TierDef = { index: 0, usableWidthCm: 50, clearanceHeightCm: 16, usableDepthCm: 15 };
  const items = itemsById([
    { id: 'a', image: '', realWidthCm: 10, realHeightCm: 5, realDepthCm: 5 },
    { id: 'b', image: '', realWidthCm: 20, realHeightCm: 5, realDepthCm: 5 },
  ]);

  it('由左到右累加排隊，tier以x=0置中（第一個從-usableWidthCm/2開始）', () => {
    const positions = tierItemPositions(tier, [{ placementId: 'p1', itemId: 'a' }], items);
    expect(positions[0].centerX).toBe(-25 + 5); // -usableWidthCm/2 + 半個寬度
  });

  it('第二個接在第一個右邊，中心點正確累加', () => {
    const positions = tierItemPositions(
      tier,
      [
        { placementId: 'p1', itemId: 'a' }, // 寬10
        { placementId: 'p2', itemId: 'b' }, // 寬20
      ],
      items
    );
    expect(positions[0].centerX).toBe(-20); // -25+5
    expect(positions[1].centerX).toBe(-20 + 5 + 10); // 前一個結束位置(-25+10=-15) + b半寬10
  });

  it('itemsById查不到的itemId直接跳過，不影響後面項目的排隊位置', () => {
    const positions = tierItemPositions(
      tier,
      [
        { placementId: 'p1', itemId: 'unknown-item' },
        { placementId: 'p2', itemId: 'a' },
      ],
      items
    );
    expect(positions).toHaveLength(1);
    expect(positions[0].centerX).toBe(-20); // 就好像unknown那筆根本不存在
  });
});

describe('computeInsertIndex', () => {
  const tier: TierState = {
    index: 0,
    usableWidthCm: 50,
    clearanceHeightCm: 16,
    usableDepthCm: 15,
    placedItems: [
      { placementId: 'p1', itemId: 'a' },
      { placementId: 'p2', itemId: 'b' },
    ],
  };
  const items = itemsById([
    { id: 'a', image: '', realWidthCm: 10, realHeightCm: 5, realDepthCm: 5 }, // centerX = -20
    { id: 'b', image: '', realWidthCm: 20, realHeightCm: 5, realDepthCm: 5 }, // centerX = -5
  ]);

  it('放開手位置在所有項目左邊 -> 插入index 0', () => {
    expect(computeInsertIndex(tier, -100, 'dragging', items)).toBe(0);
  });

  it('放開手位置在所有項目右邊 -> 插入到最後', () => {
    expect(computeInsertIndex(tier, 100, 'dragging', items)).toBe(2);
  });

  it('放開手位置在a跟b中間 -> 插入index 1', () => {
    expect(computeInsertIndex(tier, -10, 'dragging', items)).toBe(1);
  });

  it('排除掉自己（excludePlacementId）後，插入位置只看剩下的項目重新排隊的結果', () => {
    // 把a排除掉之後，b自己排隊會往前補到cursor起點（centerX變成-15，不是原本兩個一起排隊時的-5）
    const insertAt = computeInsertIndex(tier, -100, 'p1', items);
    expect(insertAt).toBe(0);
  });
});
