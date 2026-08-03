'use client';

import { useState } from 'react';
import type { PlayerDesign } from '@/types/database';
import MiniPixelPreview from './MiniPixelPreview';

// 「查看設計庫」跟「匯入設計」本來是兩個按鈕、開兩套幾乎一樣的清單，2026-08-03 跟 Peggy
// 討論後合併：只留「查看設計庫」一個入口，清單一律可以勾選，勾好之後用「匯入設計」（只能勾1張）
// 或「刪除」（可以勾多張）決定要做什麼。容量滿了時「選擇要覆蓋哪張」維持原本點一下就選定的
// 獨立模式，跟這裡的多選不衝突。
export default function DesignLibraryModal({
  mode,
  designs,
  onImport,
  onDelete,
  onSelect,
  deleting,
  onClose,
}: {
  mode: 'view' | 'overwrite';
  designs: PlayerDesign[];
  onImport?: (design: PlayerDesign) => void;
  onDelete?: (ids: number[]) => void;
  onSelect?: (design: PlayerDesign) => void;
  deleting?: boolean;
  onClose: () => void;
}) {
  const title = mode === 'view' ? '我的設計庫' : '選擇要覆蓋的設計';
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedDesign = designs.find((d) => selectedIds.has(d.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-900">
            關閉
          </button>
        </div>

        {mode === 'overwrite' && (
          <p className="mb-3 text-xs text-neutral-500">設計庫已滿，選一張要覆蓋的設計（原本的圖案會被換掉）。</p>
        )}

        {mode === 'view' && designs.length > 0 && (
          <div className="mb-3 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={selectedIds.size !== 1}
              onClick={() => selectedDesign && onImport?.(selectedDesign)}
              className="rounded border border-neutral-300 px-2 py-1 text-xs enabled:hover:border-neutral-500 disabled:opacity-40"
            >
              匯入設計
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || deleting}
              onClick={() => onDelete?.([...selectedIds])}
              className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 enabled:hover:border-red-500 disabled:opacity-40"
            >
              {deleting ? '刪除中…' : '刪除'}
            </button>
          </div>
        )}

        {designs.length === 0 ? (
          <p className="text-sm text-neutral-400">設計庫目前是空的。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {designs.map((design) => (
              <li key={design.id} className="flex items-center gap-2">
                {mode === 'view' && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(design.id)}
                    onChange={() => toggleSelected(design.id)}
                    className="h-4 w-4 shrink-0"
                  />
                )}
                <button
                  type="button"
                  onClick={() => (mode === 'view' ? toggleSelected(design.id) : onSelect?.(design))}
                  className="flex w-full items-center gap-3 rounded border border-neutral-200 p-2 text-left hover:border-neutral-500"
                >
                  <MiniPixelPreview pixelData={design.pixel_data} />
                  <span className="text-sm">{design.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
