'use client';

import type { PlayerDesign } from '@/types/database';
import MiniPixelPreview from './MiniPixelPreview';

// 「查看設計庫」／「匯入設計」／容量滿了時的「選擇要覆蓋哪張」共用同一個元件，
// 用途用 mode 區分文案跟點擊行為（見 idea/設計坊.png 線框圖）。
export default function DesignLibraryModal({
  mode,
  designs,
  onSelect,
  onClose,
}: {
  mode: 'view' | 'import' | 'overwrite';
  designs: PlayerDesign[];
  onSelect?: (design: PlayerDesign) => void;
  onClose: () => void;
}) {
  const title = mode === 'view' ? '我的設計庫' : mode === 'import' ? '匯入設計' : '選擇要覆蓋的設計';

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

        {designs.length === 0 ? (
          <p className="text-sm text-neutral-400">設計庫目前是空的。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {designs.map((design) => (
              <li key={design.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(design)}
                  disabled={mode === 'view'}
                  className="flex w-full items-center gap-3 rounded border border-neutral-200 p-2 text-left enabled:hover:border-neutral-500 disabled:cursor-default"
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
