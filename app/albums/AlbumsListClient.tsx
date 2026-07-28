'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createAlbum, deleteAlbum, type AlbumWithPageCount } from '@/lib/supabase/albums';

export default function AlbumsListClient({ initialAlbums }: { initialAlbums: AlbumWithPageCount[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [albumType, setAlbumType] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setError(null);
    setCreating(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('未登入');

      const album = await createAlbum(supabase, user.id, name.trim(), albumType.trim() || null);
      router.push(`/albums/${album.id}`);
    } catch {
      setError('建立失敗，請稍後再試');
      setCreating(false);
    }
  }

  async function handleDelete(albumId: number) {
    const supabase = createClient();
    try {
      await deleteAlbum(supabase, albumId);
      router.refresh();
    } catch {
      setError('刪除失敗，請稍後再試');
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
        <p className="text-sm font-medium">新增收納冊</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            required
            placeholder="收納冊名稱"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="類型（選填，例如小卡收納簿）"
            value={albumType}
            onChange={(e) => setAlbumType(e.target.value)}
            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {creating ? '建立中…' : '新增'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {initialAlbums.length === 0 ? (
        <p className="text-sm text-neutral-500">目前還沒有任何收納冊，建立第一本開始整理你的收藏吧。</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {initialAlbums.map((album) => (
            <div key={album.id} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
              <Link href={`/albums/${album.id}`} className="font-medium hover:underline">
                {album.name}
              </Link>
              <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                {album.album_type && <span>{album.album_type}</span>}
                <span>{album.pageCount} 頁</span>
                <span
                  className={
                    album.is_public
                      ? 'rounded-full bg-blue-100 px-2 py-0.5 text-blue-800'
                      : 'rounded-full border border-neutral-300 px-2 py-0.5'
                  }
                >
                  {album.is_public ? '公開' : '私人'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(album.id)}
                className="self-start text-xs text-red-600 underline"
              >
                刪除收納冊
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
