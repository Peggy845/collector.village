import type { OwnedStatus } from '@/types/database';

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
