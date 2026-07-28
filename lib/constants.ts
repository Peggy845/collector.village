import type { LayoutType, OwnedStatus } from '@/types/database';

export const OWNED_STATUS_LABELS: Record<OwnedStatus, { label: string; className: string }> = {
  owned_real: {
    label: '已擁有',
    className: 'bg-green-100 text-green-800 border border-green-300',
  },
  owned_virtual: {
    label: '虛擬收藏',
    className: 'bg-purple-100 text-purple-800 border border-purple-300',
  },
  wanted: {
    label: '想要',
    className: 'bg-transparent text-neutral-600 border border-neutral-400',
  },
};

// 我的收納冊：九選一固定版面模板，不提供自訂行列數（見 claude-code-instructions-albums.md 第二節）
export const ALBUM_LAYOUT_TEMPLATES: Record<
  LayoutType,
  { slots: number; cols: number; rows: number; label: string }
> = {
  '1': { slots: 1, cols: 1, rows: 1, label: '1格' },
  '2h': { slots: 2, cols: 2, rows: 1, label: '2格（橫向）' },
  '2v': { slots: 2, cols: 1, rows: 2, label: '2格（直向）' },
  '3h': { slots: 3, cols: 3, rows: 1, label: '3格（橫向）' },
  '3v': { slots: 3, cols: 1, rows: 3, label: '3格（直向）' },
  '4': { slots: 4, cols: 2, rows: 2, label: '4格' },
  '6': { slots: 6, cols: 2, rows: 3, label: '6格' },
  '8': { slots: 8, cols: 2, rows: 4, label: '8格' },
  '9': { slots: 9, cols: 3, rows: 3, label: '9格' },
};
