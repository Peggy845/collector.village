'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  assignSlotProduct,
  clearSlot,
  createAlbumPage,
  setAlbumPublic,
  type OwnedCollectionOption,
  type PageWithSlots,
} from '@/lib/supabase/albums';
import { ALBUM_LAYOUT_TEMPLATES } from '@/lib/constants';
import type { CollectionAlbum, LayoutType } from '@/types/database';

const LAYOUT_ORDER: LayoutType[] = ['1', '2h', '2v', '3h', '3v', '4', '6', '8', '9'];

export default function AlbumEditor({
  album,
  pages,
  ownedOptions,
}: {
  album: CollectionAlbum;
  pages: PageWithSlots[];
  ownedOptions: OwnedCollectionOption[];
}) {
  const router = useRouter();
  const [pageIdx, setPageIdx] = useState(0);
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const currentPage = pages[pageIdx] ?? null;
  const template = currentPage ? ALBUM_LAYOUT_TEMPLATES[currentPage.page.layout_type] : null;

  const usedCollectionIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of pages) {
      for (const s of p.slots) {
        if (s.slot.user_collection_id) ids.add(s.slot.user_collection_id);
      }
    }
    return ids;
  }, [pages]);

  const pickerOptions = useMemo(() => {
    const available = ownedOptions.filter((o) => !usedCollectionIds.has(o.userCollectionId));
    if (!pickerSearch.trim()) return available;
    const q = pickerSearch.trim().toLowerCase();
    return available.filter((o) => o.product.name.toLowerCase().includes(q));
  }, [ownedOptions, usedCollectionIds, pickerSearch]);

  function slotAt(index: number) {
    return currentPage?.slots.find((s) => s.slot.slot_index === index) ?? null;
  }

  async function handleAddPage(layoutType: LayoutType) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      await createAlbumPage(supabase, album.id, layoutType);
      setShowLayoutPicker(false);
      setPageIdx(pages.length);
      router.refresh();
    } catch {
      setError('新增頁面失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function handlePickProduct(userCollectionId: number) {
    if (!currentPage || activeSlotIndex === null) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const result = await assignSlotProduct(
        supabase,
        album.id,
        currentPage.page.id,
        activeSlotIndex,
        userCollectionId
      );
      if (!result.ok) {
        setError('這件商品已經放在這本收納冊的其他格子裡了');
        return;
      }
      setActiveSlotIndex(null);
      setPickerSearch('');
      router.refresh();
    } catch {
      setError('選入失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function handleClearSlot(slotIndex: number) {
    if (!currentPage) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      await clearSlot(supabase, currentPage.page.id, slotIndex);
      router.refresh();
    } catch {
      setError('移除失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePublic() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      await setAlbumPublic(supabase, album.id, !album.is_public, album.share_token);
      router.refresh();
    } catch {
      setError('設定失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  function handleCopyLink() {
    if (!album.share_token) return;
    const url = `${window.location.origin}/albums/share/${album.share_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{album.name}</h1>
        {album.album_type && <p className="text-sm text-neutral-500">{album.album_type}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded border border-neutral-200 p-4">
        <button
          type="button"
          disabled={busy}
          onClick={handleTogglePublic}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {album.is_public ? '設為私人' : '設為公開'}
        </button>
        {album.is_public && album.share_token && (
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <span className="rounded bg-neutral-100 px-2 py-1 font-mono text-xs">
              /albums/share/{album.share_token}
            </span>
            <button type="button" onClick={handleCopyLink} className="underline">
              {copied ? '已複製' : '複製連結'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {pages.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-300 p-8 text-center">
          <p className="mb-4 text-sm text-neutral-500">這本收納冊還沒有任何頁面。</p>
          <LayoutPicker onPick={handleAddPage} disabled={busy} />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={pageIdx === 0}
              onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
              className="disabled:opacity-30"
            >
              ← 上一頁
            </button>
            <span>
              第 {pageIdx + 1} / {pages.length} 頁
            </span>
            <button
              type="button"
              disabled={pageIdx === pages.length - 1}
              onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + 1))}
              className="disabled:opacity-30"
            >
              下一頁 →
            </button>
          </div>

          {template && (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${template.cols}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: template.slots }, (_, i) => {
                const filled = slotAt(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveSlotIndex(i)}
                    className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded border border-neutral-300 p-2 text-center hover:border-neutral-500"
                  >
                    {filled?.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={filled.photoUrl} alt={filled.product?.name ?? ''} className="h-full w-full object-cover" />
                    ) : filled?.product ? (
                      <span className="text-xs">{filled.product.name}</span>
                    ) : (
                      <span className="text-2xl text-neutral-300">+</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowLayoutPicker((v) => !v)}
            className="self-start text-sm underline"
          >
            新增頁面
          </button>
          {showLayoutPicker && <LayoutPicker onPick={handleAddPage} disabled={busy} />}
        </>
      )}

      {activeSlotIndex !== null && (
        <div className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">選擇商品放入這一格</p>
            <div className="flex gap-3 text-xs">
              {slotAt(activeSlotIndex)?.product && (
                <button
                  type="button"
                  onClick={() => handleClearSlot(activeSlotIndex)}
                  className="text-red-600 underline"
                >
                  移除這格
                </button>
              )}
              <button type="button" onClick={() => setActiveSlotIndex(null)} className="text-neutral-500 underline">
                關閉
              </button>
            </div>
          </div>
          <input
            type="text"
            placeholder="搜尋商品名稱"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {pickerOptions.length === 0 ? (
              <p className="col-span-full text-sm text-neutral-500">沒有可選的商品（只能選已擁有/虛擬收藏，且同一件商品不能重複放入同一本收納冊）</p>
            ) : (
              pickerOptions.map((o) => (
                <button
                  key={o.userCollectionId}
                  type="button"
                  disabled={busy}
                  onClick={() => handlePickProduct(o.userCollectionId)}
                  className="rounded border border-neutral-200 p-2 text-left text-xs hover:border-neutral-500 disabled:opacity-50"
                >
                  {o.product.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LayoutPicker({
  onPick,
  disabled,
}: {
  onPick: (layout: LayoutType) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {LAYOUT_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onPick(key)}
          className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:border-neutral-500 disabled:opacity-50"
        >
          {ALBUM_LAYOUT_TEMPLATES[key].label}
        </button>
      ))}
    </div>
  );
}
