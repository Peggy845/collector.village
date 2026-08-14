'use client';

import { PX_PER_CM } from '@/lib/dream-room/scale';

// 頂視角俯視縮圖：不是真3D，純粹用2D方塊排列出「從上面看下去」的深度關係，讓深度
// 不再是完全看不見的隱藏數字。書櫃層架天生就是左到右排隊，所以俯視圖的x位置直接沿用
// 正面view的排列順序，不用另外設計座標系統。故意縮小比例，避免跟正面view搶視覺重量。
const TOPDOWN_PX_PER_CM = PX_PER_CM * 0.5;

export interface FootprintItem {
  id: string;
  widthCm: number;
  depthCm: number;
  overflow: boolean; // 深度是否超出容器可用深度，只取布林值上色，不顯示數字
  xCm?: number; // 給定時直接用這個x位置（例如堆疊箱依欄位index换算），不給則沿用前一個方塊累加排隊（書櫃層架的排列順序）
}

export default function TopDownFootprint({
  boundaryWidthCm,
  boundaryDepthCm,
  items,
}: {
  boundaryWidthCm: number;
  boundaryDepthCm: number;
  items: FootprintItem[];
}) {
  // 先算好每個方塊的x位置（沒指定xCm的就接在前一個方塊右邊），不在render中用外部變數累加，
  // 避免react-hooks/immutability規則認定的「render過程中重新賦值」。
  const positioned = items.reduce<{ item: FootprintItem; xCm: number }[]>((acc, item) => {
    const prev = acc[acc.length - 1];
    const xCm = item.xCm ?? (prev ? prev.xCm + prev.item.widthCm : 0);
    return [...acc, { item, xCm }];
  }, []);

  return (
    <div className="flex justify-center">
      <div
        title="俯視深度示意，太深的話會看到方塊頂出邊界"
        className="relative overflow-visible rounded-sm border border-[#B08A63]/60 bg-[#EFE3D6]/40"
        style={{ width: boundaryWidthCm * TOPDOWN_PX_PER_CM, height: boundaryDepthCm * TOPDOWN_PX_PER_CM }}
      >
        {positioned.map(({ item, xCm }) => {
          const left = xCm * TOPDOWN_PX_PER_CM;
          return (
            <div
              key={item.id}
              className={`absolute top-0 rounded-[1px] transition-colors ${
                item.overflow ? 'bg-red-400/60' : 'bg-[#8FB4C9]/70'
              }`}
              style={{
                left,
                width: Math.max(2, item.widthCm * TOPDOWN_PX_PER_CM - 1),
                height: Math.max(2, item.depthCm * TOPDOWN_PX_PER_CM),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
