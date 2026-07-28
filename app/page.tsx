import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchProducts } from '@/lib/supabase/products';
import ProductCard from '@/components/ProductCard';

export default async function Home() {
  const supabase = await createClient();
  const { products } = await fetchProducts(supabase, {}, 1);
  const featured = products.slice(0, 6);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-16">
      <section className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold sm:text-4xl">Collector.Village</h1>
        <p className="max-w-xl text-neutral-600">
          動漫周邊收藏管理工具。勾選你擁有的商品、追蹤收藏紀錄，先以《進擊的巨人》為主軸，未來持續擴充其他 IP。
        </p>
        <div className="flex gap-3">
          <Link href="/register" className="rounded bg-neutral-900 px-5 py-2.5 text-sm text-white hover:bg-neutral-700">
            免費註冊
          </Link>
          <Link href="/browse" className="rounded border border-neutral-300 px-5 py-2.5 text-sm hover:border-neutral-500">
            瀏覽收藏庫
          </Link>
        </div>
      </section>

      {featured.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-medium">精選商品</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
