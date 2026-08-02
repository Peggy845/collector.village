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
        <p className="text-lg text-neutral-700">一個人做給收藏迷的收藏小天地</p>
        <p className="max-w-xl text-neutral-600">
          這是一個由粉絲獨立開發、目前仍在持續建置中的收藏管理網站，目標是讓動漫周邊收藏迷可以輕鬆記錄、瀏覽自己的收藏，
          不用再靠 Excel 或記憶力。目前優先建置其中一部人氣作品的收藏資料，未來會持續擴充更多作品。
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

      <section className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-medium">現在已經可以做的事</h2>
          <ul className="flex flex-col gap-2 text-sm text-neutral-600">
            <li>瀏覽超過 400 件已收錄的商品資料</li>
            <li>註冊帳號</li>
            <li>標記「已擁有／想要／虛擬收藏」</li>
            <li>上傳自己的實體照片</li>
            <li>用「我的收納冊」整理、展示、分享收藏</li>
            <li>在「設計坊」自己畫設計圖，拿去「工廠」生產、「超市」上架賣</li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-medium">接下來正在開發</h2>
          <p className="text-sm text-neutral-600">
            <span className="font-medium text-neutral-800">「設計坊」功能加強中</span>
            ——目前已經可以畫圖、存進個人設計庫、拿去工廠生產，接下來會陸續補上更多細節（例如自訂造型外框）。
          </p>
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

      <section className="text-center text-sm text-neutral-500">
        <p>這是一個持續成長中的個人專案，功能會陸續增加，歡迎現在就註冊搶先體驗，之後也會持續更新進度。</p>
      </section>
    </main>
  );
}
