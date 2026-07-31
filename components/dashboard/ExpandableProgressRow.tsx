'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface ProgressRowItem {
  id: number;
  name: string;
  ownedStatus: 'owned_real' | 'owned_virtual';
}

interface Props {
  label: string;
  countLabel: string;
  virtualLabel?: string | null;
  items: ProgressRowItem[];
  variant: 'row' | 'pill';
}

export default function ExpandableProgressRow({ label, countLabel, virtualLabel, items, variant }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={variant === 'pill' ? 'self-start' : undefined}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          variant === 'row'
            ? 'flex w-full items-center justify-between rounded border border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50'
            : 'rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50'
        }
      >
        {variant === 'row' ? (
          <>
            <span className="text-sm">{label}</span>
            <span className="text-sm text-neutral-600">
              {countLabel}
              {virtualLabel && <span className="ml-2 text-purple-700">{virtualLabel}</span>}
            </span>
          </>
        ) : (
          <>
            {label} · {countLabel}
            {virtualLabel && <span className="ml-1 text-purple-700">{virtualLabel}</span>}
          </>
        )}
      </button>

      {open && (
        <ul className="mt-1 flex flex-col gap-1 border-l border-neutral-200 py-1 pl-4">
          {items.length === 0 ? (
            <li className="text-xs text-neutral-400">沒有找到對應商品</li>
          ) : (
            items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/products/${item.id}`}
                  className="flex items-center justify-between gap-2 text-xs text-neutral-700 hover:underline"
                >
                  <span>{item.name}</span>
                  {item.ownedStatus === 'owned_virtual' && <span className="text-purple-700">虛擬收藏</span>}
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
