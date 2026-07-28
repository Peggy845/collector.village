import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/auth';
import { fetchUserAlbums } from '@/lib/supabase/albums';
import AlbumsListClient from './AlbumsListClient';

export const metadata: Metadata = {
  title: '我的收納冊 | Collector.Village',
  robots: { index: false, follow: false },
};

export default async function AlbumsPage() {
  const supabase = await createClient();
  const user = await requireUser(supabase, '/albums');
  const albums = await fetchUserAlbums(supabase, user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">我的收納冊</h1>
        <p className="mt-1 text-sm text-neutral-500">
          把你已擁有的商品整理成收納冊，可設定公開分享連結。
        </p>
      </div>

      <AlbumsListClient initialAlbums={albums} />
    </main>
  );
}
