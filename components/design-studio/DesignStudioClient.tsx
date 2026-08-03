'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlayerDesign } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import { createEmptyGrid, isValidPixelData } from '@/lib/design-studio/palette';
import { rasterizePixelGrid } from '@/lib/design-studio/render';
import { buildPlayerDesignUploadPath, uploadPlayerDesignImage } from '@/lib/supabase/design-studio';
import PixelCanvas from './PixelCanvas';
import PaletteBar from './PaletteBar';
import DesignLibraryModal from './DesignLibraryModal';

const CAPACITY_FULL_MARKER = '設計庫已滿';

export default function DesignStudioClient({
  userId,
  library,
  libraryCapacity,
}: {
  userId: string;
  library: PlayerDesign[];
  libraryCapacity: number;
}) {
  const router = useRouter();
  const [pixelData, setPixelData] = useState<number[]>(createEmptyGrid());
  const [selectedColor, setSelectedColor] = useState(1);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'overwrite' | null>(null);
  const [producing, setProducing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function performSave(overwriteId?: number) {
    setError(null);
    setSavedMessage(null);
    setSaving(true);
    try {
      const supabase = createClient();
      const blob = await rasterizePixelGrid(pixelData);
      const path = buildPlayerDesignUploadPath(userId);
      await uploadPlayerDesignImage(supabase, path, blob);

      const res = await fetch('/api/design-studio/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), pixelData, imagePath: path, overwriteId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '儲存失敗');

      setSavedMessage(overwriteId ? '已覆蓋這張設計！可以到工廠選這張圖生產了。' : '已存進設計庫！可以到工廠選這張圖生產了。');
      setName('');
      setModalMode(null);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : '儲存失敗';
      setError(message);
      // 容量滿了時直接引導去選要覆蓋哪張，不用她自己再點一次「儲存設計」重試。
      if (message.includes(CAPACITY_FULL_MARKER)) {
        setModalMode('overwrite');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (!name.trim()) {
      setError('請先幫這張設計取個名字');
      return;
    }
    performSave();
  }

  function handleClear() {
    setPixelData(createEmptyGrid());
    setError(null);
    setSavedMessage(null);
  }

  function handleImportSelect(design: PlayerDesign) {
    if (isValidPixelData(design.pixel_data)) {
      setPixelData(design.pixel_data);
    }
    setName(design.name);
    setModalMode(null);
    setError(null);
    setSavedMessage(null);
  }

  function handleOverwriteSelect(design: PlayerDesign) {
    performSave(design.id);
  }

  async function handleDelete(ids: number[]) {
    if (ids.length === 0) return;
    setError(null);
    setSavedMessage(null);
    setDeleting(true);
    try {
      const res = await fetch('/api/design-studio/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '刪除失敗');

      if (body.blocked?.length > 0) {
        setError(`${body.deleted.length} 張已刪除，${body.blocked.length} 張還在生產中／倉庫／貨架，賣完才能刪`);
      } else {
        setModalMode(null);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setDeleting(false);
    }
  }

  // 「直接生產」：不存進設計庫，直接帶著這張圖去工廠選機台/格式（見上方檔案註解跟
  // app/api/design-studio/produce/route.ts）。
  async function handleProduceDirect() {
    setError(null);
    setSavedMessage(null);
    setProducing(true);
    try {
      const supabase = createClient();
      const blob = await rasterizePixelGrid(pixelData);
      const path = buildPlayerDesignUploadPath(userId);
      await uploadPlayerDesignImage(supabase, path, blob);

      const res = await fetch('/api/design-studio/produce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), pixelData, imagePath: path }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '準備失敗');
      router.push(`/factory?designId=${body.factoryDesignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '準備失敗');
      setProducing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setModalMode('view')}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-500"
            >
              查看設計庫
            </button>
          </div>

          <PaletteBar selectedColor={selectedColor} onSelect={setSelectedColor} />
          <PixelCanvas pixelData={pixelData} onChange={setPixelData} selectedColor={selectedColor} />
          <button
            type="button"
            onClick={handleClear}
            className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-500"
          >
            清空畫面
          </button>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-64">
          <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
            <p className="text-xs text-neutral-500">
              設計庫 {library.length}/{libraryCapacity}
            </p>
            <label className="text-xs text-neutral-500">設計名稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="幫這張設計取個名字"
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveClick}
              className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? '儲存中…' : '儲存設計'}
            </button>
            <button
              type="button"
              disabled={producing}
              onClick={handleProduceDirect}
              className="rounded border border-neutral-300 px-3 py-2 text-sm hover:border-neutral-500 disabled:opacity-50"
            >
              {producing ? '準備中…' : '直接生產（不存進設計庫）'}
            </button>
          </div>
          {error && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-red-600">{error}</p>
              {error.includes(CAPACITY_FULL_MARKER) && (
                <button
                  type="button"
                  onClick={() => setModalMode('overwrite')}
                  className="self-start rounded border border-neutral-300 px-2 py-1 text-xs hover:border-neutral-500"
                >
                  選擇要覆蓋的設計
                </button>
              )}
            </div>
          )}
          {savedMessage && <p className="text-xs text-emerald-600">{savedMessage}</p>}
        </div>
      </div>

      {modalMode && (
        <DesignLibraryModal
          mode={modalMode}
          designs={library}
          onSelect={modalMode === 'overwrite' ? handleOverwriteSelect : undefined}
          onImport={modalMode === 'view' ? handleImportSelect : undefined}
          onDelete={modalMode === 'view' ? handleDelete : undefined}
          deleting={deleting}
          onClose={() => setModalMode(null)}
        />
      )}
    </div>
  );
}
