'use client';

import { useState } from 'react';
import { ALBUM_LAYOUT_TEMPLATES } from '@/lib/constants';
import type { PageWithSlots } from '@/lib/supabase/albums';

export default function PublicAlbumViewer({ pages }: { pages: PageWithSlots[] }) {
  const [pageIdx, setPageIdx] = useState(0);

  if (pages.length === 0) {
    return <p className="text-sm text-neutral-500">這本收納冊目前還沒有內容。</p>;
  }

  const currentPage = pages[pageIdx];
  const template = ALBUM_LAYOUT_TEMPLATES[currentPage.page.layout_type];

  return (
    <div className="flex flex-col gap-4">
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

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${template.cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: template.slots }, (_, i) => {
          const filled = currentPage.slots.find((s) => s.slot.slot_index === i) ?? null;
          return (
            <div
              key={i}
              className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded border border-neutral-200 p-2 text-center"
            >
              {filled?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={filled.photoUrl} alt={filled.product?.name ?? ''} className="h-full w-full object-cover" />
              ) : filled?.product ? (
                <span className="text-xs">{filled.product.name}</span>
              ) : (
                <span className="text-neutral-200">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
