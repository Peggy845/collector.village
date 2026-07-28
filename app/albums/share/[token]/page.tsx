import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchPublicAlbumByToken } from '@/lib/supabase/albums';
import { getCollectionPhotoSignedUrl } from '@/lib/supabase/storage';
import PublicAlbumViewer from './PublicAlbumViewer';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface SharedAlbumPageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedAlbumPage({ params }: SharedAlbumPageProps) {
  const { token } = await params;

  const supabase = await createClient();
  const detail = await fetchPublicAlbumByToken(supabase, token);
  if (!detail) notFound();

  // 訪客未必是收納冊擁有者，一般 session 無法簽出擁有者私人 Storage 裡的照片網址；
  // 這裡改用 service role 產生簽名網址，前提是上面已經確認 is_public = true 才會進到這裡。
  const admin = createAdminClient();
  const pagesWithPhotoUrls = await Promise.all(
    detail.pages.map(async (pageWithSlots) => ({
      ...pageWithSlots,
      slots: await Promise.all(
        pageWithSlots.slots.map(async (s) => ({
          ...s,
          photoUrl: s.photoUrl ? await getCollectionPhotoSignedUrl(admin, s.photoUrl) : null,
        }))
      ),
    }))
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">{detail.album.name}</h1>
        {detail.album.album_type && <p className="text-sm text-neutral-500">{detail.album.album_type}</p>}
      </div>
      <PublicAlbumViewer pages={pagesWithPhotoUrls} />
    </main>
  );
}
