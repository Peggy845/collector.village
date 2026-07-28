import { OWNED_STATUS_LABELS } from '@/lib/constants';
import type { OwnedStatus } from '@/types/database';

export default function StatusBadge({ status }: { status: OwnedStatus }) {
  const { label, className } = OWNED_STATUS_LABELS[status];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
