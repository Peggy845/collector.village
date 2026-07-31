import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/auth';
import { fetchAllUserCollections } from '@/lib/supabase/collections';
import { fetchAllProductsForProgress, fetchProductsByIds, fetchSeries } from '@/lib/supabase/products';
import {
  calculateCharacterProgress,
  calculateSeriesProgress,
  calculateSiteWideProgress,
  formatOpenCollectionLabel,
} from '@/lib/utils/collection-progress';
import ExpandableProgressRow, { type ProgressRowItem } from '@/components/dashboard/ExpandableProgressRow';

export const metadata: Metadata = {
  title: '我的收藏紀錄 | Collector.Village',
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await requireUser(supabase, '/dashboard');

  const [entries, products, seriesList] = await Promise.all([
    fetchAllUserCollections(supabase, user.id),
    fetchAllProductsForProgress(supabase),
    fetchSeries(supabase),
  ]);

  const siteWide = calculateSiteWideProgress(products, entries);
  const seriesProgress = calculateSeriesProgress(products, entries);
  const characterProgress = calculateCharacterProgress(products, entries);

  const seriesNameById = new Map(seriesList.map((s) => [s.id, s.name ?? `系列 #${s.id}`]));

  const seriesRows = [...seriesProgress.values()]
    .filter((p) => p.ownedRealCount > 0 || p.ownedVirtualCount > 0)
    .sort((a, b) => b.percentage - a.percentage);

  const characterRows = [...characterProgress.entries()]
    .filter(([, p]) => p.ownedRealCount > 0 || p.ownedVirtualCount > 0)
    .sort((a, b) => b[1].ownedRealCount - a[1].ownedRealCount);

  const wantedCount = entries.filter((e) => e.owned_status === 'wanted').length;

  // 展開列表用：只需要「已擁有（實體/虛擬）」商品的名稱，依系列、依角色分組，
  // 讓使用者點擊某一列時能看到具體是哪幾件商品貢獻了這個數字。
  const ownedStatusByProductId = new Map(
    entries
      .filter((e) => e.owned_status === 'owned_real' || e.owned_status === 'owned_virtual')
      .map((e) => [e.product_id, e.owned_status as 'owned_real' | 'owned_virtual'])
  );
  const ownedProducts = await fetchProductsByIds(supabase, [...ownedStatusByProductId.keys()]);

  const seriesItems = new Map<number, ProgressRowItem[]>();
  const characterItems = new Map<string, ProgressRowItem[]>();

  for (const product of ownedProducts) {
    const ownedStatus = ownedStatusByProductId.get(product.id);
    if (!ownedStatus) continue;
    const item: ProgressRowItem = { id: product.id, name: product.name, ownedStatus };

    if (product.series_id != null) {
      const list = seriesItems.get(product.series_id) ?? [];
      list.push(item);
      seriesItems.set(product.series_id, list);
    }

    for (const character of product.characters ?? []) {
      const list = characterItems.get(character) ?? [];
      list.push(item);
      characterItems.set(character, list);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">我的收藏紀錄</h1>
        <p className="mt-1 text-sm text-neutral-500">這是你自己的個人記錄，僅你本人看得到。</p>
      </div>

      <section className="rounded-lg border border-neutral-200 p-6">
        <p className="text-sm text-neutral-500">全站收藏</p>
        <p className="mt-1 text-lg font-medium">{formatOpenCollectionLabel(siteWide)}</p>
        {siteWide.ownedVirtualCount > 0 && (
          <p className="mt-1 text-sm text-purple-700">另有 {siteWide.ownedVirtualCount} 件虛擬收藏（不計入實體收藏進度）</p>
        )}
        {wantedCount > 0 && <p className="mt-1 text-sm text-neutral-500">想要清單中有 {wantedCount} 件</p>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">依系列</h2>
        {seriesRows.length === 0 ? (
          <p className="text-sm text-neutral-500">尚未有任何系列收藏紀錄。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {seriesRows.map((p) => (
              <li key={p.seriesId}>
                <ExpandableProgressRow
                  variant="row"
                  label={seriesNameById.get(p.seriesId) ?? `系列 #${p.seriesId}`}
                  countLabel={`${p.ownedRealCount}/${p.totalProducts} · ${p.percentage}%`}
                  virtualLabel={p.ownedVirtualCount > 0 ? `+${p.ownedVirtualCount} 虛擬` : null}
                  items={seriesItems.get(p.seriesId) ?? []}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">依角色</h2>
        {characterRows.length === 0 ? (
          <p className="text-sm text-neutral-500">尚未有任何角色收藏紀錄。</p>
        ) : (
          <ul className="flex flex-wrap items-start gap-2">
            {characterRows.map(([character, p]) => (
              <li key={character}>
                <ExpandableProgressRow
                  variant="pill"
                  label={character}
                  countLabel={`${p.ownedRealCount}/${p.totalKnownCount}`}
                  virtualLabel={p.ownedVirtualCount > 0 ? `+${p.ownedVirtualCount}` : null}
                  items={characterItems.get(character) ?? []}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
