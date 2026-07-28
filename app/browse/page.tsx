import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchProducts, fetchIps, fetchSeries, fetchFilterFacets } from '@/lib/supabase/products';
import { fetchUserCollectionsByProductIds } from '@/lib/supabase/collections';
import FilterPanel from '@/components/FilterPanel';
import ProductCard from '@/components/ProductCard';

export const metadata: Metadata = {
  title: '收藏庫瀏覽 | Collector.Village',
};

type SearchParams = Record<string, string | string[] | undefined>;

interface BrowsePageProps {
  searchParams: Promise<SearchParams>;
}

function buildPageHref(params: SearchParams, page: number) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || key === 'page') continue;
    if (Array.isArray(value)) value.forEach((v) => usp.append(key, v));
    else usp.append(key, value);
  }
  usp.set('page', String(page));
  return `?${usp.toString()}`;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  const ipId = params.ip ? Number(params.ip) : undefined;
  const seriesId = params.series ? Number(params.series) : undefined;
  const categoryGroup = typeof params.category_group === 'string' ? params.category_group : undefined;
  const category = typeof params.category === 'string' ? params.category : undefined;
  const kujiPrizeTier = typeof params.kuji === 'string' ? params.kuji : undefined;
  const characters = params.character
    ? Array.isArray(params.character)
      ? params.character
      : [params.character]
    : [];
  const page = params.page ? Math.max(1, Number(params.page)) : 1;

  const [{ products, total, pageSize }, ips, seriesList, facets] = await Promise.all([
    fetchProducts(
      supabase,
      { ipId, seriesId, categoryGroup, category, kujiPrizeTier, characters },
      page
    ),
    fetchIps(supabase),
    fetchSeries(supabase, ipId),
    fetchFilterFacets(supabase),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const collectionMap = user
    ? await fetchUserCollectionsByProductIds(
        supabase,
        user.id,
        products.map((p) => p.id)
      )
    : new Map();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 md:flex-row">
      <FilterPanel ips={ips} seriesList={seriesList} facets={facets} />
      <div className="flex-1">
        <p className="mb-4 text-sm text-neutral-500">共 {total} 件商品</p>
        {products.length === 0 ? (
          <p className="text-sm text-neutral-500">目前沒有符合條件的商品。</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                ownedStatus={collectionMap.get(product.id)?.owned_status}
              />
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4 text-sm">
            {page > 1 && <Link href={buildPageHref(params, page - 1)}>上一頁</Link>}
            <span>
              {page} / {totalPages}
            </span>
            {page < totalPages && <Link href={buildPageHref(params, page + 1)}>下一頁</Link>}
          </div>
        )}
      </div>
    </main>
  );
}
