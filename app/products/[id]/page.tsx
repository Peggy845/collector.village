import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchProductById } from '@/lib/supabase/products';
import { fetchUserCollectionForProduct } from '@/lib/supabase/collections';
import { getCollectionPhotoSignedUrl } from '@/lib/supabase/storage';
import CollectionControls from './CollectionControls';

export const metadata: Metadata = {
  robots: { index: false, follow: false }, // 商品詳情頁設為 noindex，見 PROJECT_PROGRESS.md 第25項
};

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId)) notFound();

  const supabase = await createClient();
  const product = await fetchProductById(supabase, productId);
  if (!product) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const entry = user ? await fetchUserCollectionForProduct(supabase, user.id, productId) : null;
  const photoUrl = entry?.photo_url ? await getCollectionPhotoSignedUrl(supabase, entry.photo_url) : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <Link href="/browse" className="text-sm text-neutral-500 underline">
        ← 返回收藏庫瀏覽
      </Link>

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        {product.series?.name && <p className="text-neutral-600">{product.series.name}</p>}

        <div className="flex flex-wrap gap-2 text-sm text-neutral-600">
          {product.category_group && <span className="rounded bg-neutral-100 px-2 py-1">{product.category_group}</span>}
          {product.category && <span className="rounded bg-neutral-100 px-2 py-1">{product.category}</span>}
          {product.kuji_prize_tier && <span className="rounded bg-neutral-100 px-2 py-1">{product.kuji_prize_tier}</span>}
          {product.manufacturer && <span className="rounded bg-neutral-100 px-2 py-1">{product.manufacturer}</span>}
        </div>

        {product.characters && product.characters.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-neutral-500">角色</p>
            <div className="flex flex-wrap gap-1">
              {product.characters.map((c) => (
                <span key={c} className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {product.character_aliases && product.character_aliases.length > 0 && (
          <p className="text-xs text-neutral-500">別名：{product.character_aliases.join('、')}</p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-neutral-600">
          {product.official_price && (
            <>
              <dt className="text-neutral-400">定價</dt>
              <dd>{product.official_price}</dd>
            </>
          )}
          {product.release_date && (
            <>
              <dt className="text-neutral-400">發售日</dt>
              <dd>{product.release_date}</dd>
            </>
          )}
        </dl>

        {product.tags && product.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {product.tags.map((t) => (
              <span key={t} className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      <hr className="border-neutral-200" />

      {user ? (
        <CollectionControls
          productId={productId}
          userId={user.id}
          initialEntry={entry}
          initialPhotoUrl={photoUrl}
        />
      ) : (
        <p className="text-sm text-neutral-600">
          <Link href={`/login?redirect=${encodeURIComponent(`/products/${productId}`)}`} className="underline">
            登入
          </Link>
          後即可標記擁有狀態、寫備註、上傳照片。
        </p>
      )}
    </main>
  );
}
