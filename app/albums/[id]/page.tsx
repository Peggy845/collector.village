import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/auth';
import { fetchAlbumForOwner, fetchOwnedCollectionOptions } from '@/lib/supabase/albums';
import { getCollectionPhotoSignedUrl } from '@/lib/supabase/storage';
import AlbumEditor from './AlbumEditor';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface AlbumDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AlbumDetailPage({ params }: AlbumDetailPageProps) {
  const { id } = await params;
  const albumId = Number(id);
  if (!Number.isInteger(albumId)) notFound();

  const supabase = await createClient();
  const user = await requireUser(supabase, `/albums/${albumId}`);

  const detail = await fetchAlbumForOwner(supabase, albumId, user.id);
  if (!detail) notFound();

  const ownedOptions = await fetchOwnedCollectionOptions(supabase, user.id);

  const pagesWithPhotoUrls = await Promise.all(
    detail.pages.map(async (pageWithSlots) => ({
      ...pageWithSlots,
      slots: await Promise.all(
        pageWithSlots.slots.map(async (s) => ({
          ...s,
          photoUrl: s.photoUrl ? await getCollectionPhotoSignedUrl(supabase, s.photoUrl) : null,
        }))
      ),
    }))
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <AlbumEditor
        album={detail.album}
        pages={pagesWithPhotoUrls}
        ownedOptions={ownedOptions}
      />
    </main>
  );
}
