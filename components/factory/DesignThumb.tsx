import { getFactoryDesignUrl } from '@/lib/supabase/factory';
import type { FactoryDesign } from '@/types/database';

// 正式圖庫還沒準備好之前，design.storage_path 可能是 null，這時改用文字色塊當佔位，
// 讓工廠功能可以先跑起來（見 PROJECT_PROGRESS.md 已定案項目31）。
export default function DesignThumb({
  design,
  className,
  onClick,
}: {
  design: FactoryDesign;
  className: string;
  onClick?: () => void;
}) {
  if (design.storage_path) {
    const bucket = design.user_id ? 'player-designs' : 'factory-designs';
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={getFactoryDesignUrl(design.storage_path, bucket)}
        alt={design.name ?? '設計圖'}
        onClick={onClick}
        className={className}
      />
    );
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-center bg-neutral-100 p-1 text-center text-[11px] leading-tight text-neutral-600 ${className}`}
    >
      {design.name ?? '設計圖'}
    </div>
  );
}
