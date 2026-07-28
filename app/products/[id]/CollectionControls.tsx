'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  removeCollectionEntry,
  updateCollectionDetails,
  upsertOwnedStatus,
} from '@/lib/supabase/collections';
import {
  buildPhotoPath,
  deleteCollectionPhoto,
  getCollectionPhotoSignedUrl,
  uploadCollectionPhoto,
} from '@/lib/supabase/storage';
import { resizeImageForUpload } from '@/lib/utils/image';
import { OWNED_STATUS_LABELS } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';
import type { OwnedStatus, UserCollectionEntry } from '@/types/database';

const STATUS_ACTION_LABELS: Record<OwnedStatus, string> = {
  owned_real: '標記為已擁有',
  wanted: '加入想要清單',
  owned_virtual: '標記為虛擬收藏',
};

const STATUS_ORDER: OwnedStatus[] = ['owned_real', 'wanted', 'owned_virtual'];

export default function CollectionControls({
  productId,
  userId,
  initialEntry,
  initialPhotoUrl,
}: {
  productId: number;
  userId: string;
  initialEntry: UserCollectionEntry | null;
  initialPhotoUrl: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [status, setStatus] = useState<OwnedStatus | null>(initialEntry?.owned_status ?? null);
  const [note, setNote] = useState(initialEntry?.note ?? '');
  const [acquiredDate, setAcquiredDate] = useState(initialEntry?.acquired_date ?? '');
  const [photoPath, setPhotoPath] = useState(initialEntry?.photo_url ?? null);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSetStatus(next: OwnedStatus) {
    setError(null);
    setSaving(true);
    try {
      await upsertOwnedStatus(supabase, userId, productId, next);
      setStatus(next);
      router.refresh();
    } catch {
      setError('儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDetails() {
    setError(null);
    setSaving(true);
    try {
      await updateCollectionDetails(supabase, userId, productId, {
        note,
        acquiredDate: acquiredDate || null,
      });
    } catch {
      setError('儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setSaving(true);
    try {
      if (photoPath) await deleteCollectionPhoto(supabase, photoPath).catch(() => {});
      await removeCollectionEntry(supabase, userId, productId);
      setStatus(null);
      setNote('');
      setAcquiredDate('');
      setPhotoPath(null);
      setPhotoUrl(null);
      router.refresh();
    } catch {
      setError('移除失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('照片檔案需小於 5MB');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const resized = await resizeImageForUpload(file);
      const path = buildPhotoPath(userId, productId, resized);
      await uploadCollectionPhoto(supabase, path, resized);
      if (photoPath) await deleteCollectionPhoto(supabase, photoPath).catch(() => {});
      await updateCollectionDetails(supabase, userId, productId, { photoUrl: path });
      const signedUrl = await getCollectionPhotoSignedUrl(supabase, path);
      setPhotoPath(path);
      setPhotoUrl(signedUrl);
    } catch {
      setError('照片上傳失敗，請稍後再試');
    } finally {
      setUploading(false);
    }
  }

  if (!status) {
    return (
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              disabled={saving}
              onClick={() => handleSetStatus(s)}
              className="rounded border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-500 disabled:opacity-50"
            >
              {STATUS_ACTION_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <StatusBadge status={status} />
        <button
          type="button"
          disabled={saving}
          onClick={handleRemove}
          className="text-sm text-neutral-500 underline disabled:opacity-50"
        >
          移除標記
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.filter((s) => s !== status).map((s) => (
          <button
            key={s}
            type="button"
            disabled={saving}
            onClick={() => handleSetStatus(s)}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:border-neutral-500 disabled:opacity-50"
          >
            改標記為{OWNED_STATUS_LABELS[s].label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
        <label className="flex flex-col gap-1 text-sm">
          備註
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            placeholder="價格觀察、購入緣由等，自由填寫"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          入手日期
          <input
            type="date"
            value={acquiredDate ?? ''}
            onChange={(e) => setAcquiredDate(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={handleSaveDetails}
          className="self-start rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? '儲存中…' : '儲存備註'}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
        <p className="text-sm font-medium">實體照片</p>
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="收藏照片" className="max-h-64 w-auto rounded object-contain" />
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-500">上傳照片（jpg/png/webp，單檔上限 5MB，會自動壓縮）</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} disabled={uploading} />
        </label>
        {uploading && <p className="text-xs text-neutral-500">上傳中…</p>}
      </div>
    </div>
  );
}
