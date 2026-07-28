import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/auth';
import { fetchUserCollectionsByStatus } from '@/lib/supabase/collections';
import { fetchProductsByIds } from '@/lib/supabase/products';
import ProductCard from '@/components/ProductCard';

export const metadata: Metadata = {
  title: '想要清單 | Collector.Village',
  robots: { index: false, follow: false },
};

export default async function WishlistPage() {
  const supabase = await createClient();
  const user = await requireUser(supabase, '/wishlist');

  const entries = await fetchUserCollectionsByStatus(supabase, user.id, 'wanted');
  const products = await fetchProductsByIds(supabase, entries.map((e) => e.product_id));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">想要清單</h1>
        <p className="mt-1 text-sm text-neutral-500">共 {products.length} 件</p>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-neutral-500">
          目前想要清單是空的，到{' '}
          <a href="/browse" className="underline">
            收藏庫瀏覽
          </a>{' '}
          逛逛，看到喜歡的商品可以標記「想要」。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} ownedStatus="wanted" />
          ))}
        </div>
      )}
    </main>
  );
}
