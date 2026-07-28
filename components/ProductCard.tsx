import Link from 'next/link';
import StatusBadge from './StatusBadge';
import type { ProductWithRelations } from '@/lib/supabase/products';
import type { OwnedStatus } from '@/types/database';

export default function ProductCard({
  product,
  ownedStatus,
}: {
  product: ProductWithRelations;
  ownedStatus?: OwnedStatus;
}) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 transition hover:border-neutral-400"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{product.name}</h3>
        {ownedStatus && <StatusBadge status={ownedStatus} />}
      </div>
      {product.series?.name && <p className="text-xs text-neutral-500">{product.series.name}</p>}
      <div className="flex flex-wrap gap-1 text-xs text-neutral-500">
        {product.category_group && <span>{product.category_group}</span>}
        {product.category && <span>· {product.category}</span>}
        {product.kuji_prize_tier && <span>· {product.kuji_prize_tier}</span>}
      </div>
      {product.characters && product.characters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {product.characters.map((c) => (
            <span key={c} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
              {c}
            </span>
          ))}
        </div>
      )}
      {product.official_price && <p className="text-xs text-neutral-500">{product.official_price}</p>}
    </Link>
  );
}
