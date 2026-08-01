import Link from 'next/link';
import { findFormatByKey } from '@/lib/factory/catalog';
import type { FactoryDesign, FactoryInventoryItem } from '@/types/database';
import DesignThumb from './DesignThumb';

// 工廠倉庫改成純展示（見 PROJECT_PROGRESS.md 已定案項目 32）：東西放在這裡不會自動變賣，
// 想變現要去 /market 買貨架、上架。原本這裡的「全部賣掉」即時收購按鈕已經拿掉。
export default function Warehouse({
  inventory,
  designs,
  capacity,
}: {
  inventory: FactoryInventoryItem[];
  designs: FactoryDesign[];
  capacity: { used: number; total: number };
}) {
  const designById = new Map(designs.map((d) => [d.id, d]));
  const isFull = capacity.used >= capacity.total;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-medium">工廠倉庫</h2>
        <p className={`text-xs ${isFull ? 'font-medium text-red-600' : 'text-neutral-500'}`}>
          容量 {capacity.used}/{capacity.total}
          {isFull && '・已滿，去超市上架清空間或升級倉庫'}
        </p>
      </div>
      {inventory.length === 0 ? (
        <p className="text-sm text-neutral-500">倉庫目前是空的，先去上面的機台生產一批看看。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {inventory.map((item) => {
            const format = findFormatByKey(item.format_key);
            const design = designById.get(item.design_id);
            if (!format) return null;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded border border-neutral-200 px-4 py-3"
              >
                {design && (
                  <DesignThumb
                    design={design}
                    className="h-12 w-12 shrink-0 rounded border border-neutral-200 object-cover"
                  />
                )}
                <div className="flex-1 text-sm">
                  <p>
                    {format.name} × {item.quantity}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/market"
        className="mt-3 inline-block rounded border border-neutral-300 px-3 py-1.5 text-xs hover:border-neutral-500"
      >
        去超市上架 →
      </Link>
    </section>
  );
}
