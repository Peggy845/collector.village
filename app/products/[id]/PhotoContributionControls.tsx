'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  buildProductPhotoSubmissionPath,
  deleteProductPhotoSubmission,
  uploadProductPhotoSubmission,
} from '@/lib/supabase/storage';
import {
  fetchMyPhotoSubmission,
  submitProductPhoto,
  withdrawPhotoSubmission,
} from '@/lib/supabase/photo-submissions';
import { resizeImageForUpload } from '@/lib/utils/image';
import type { ProductPhotoSubmission, SubmissionStatus } from '@/types/database';

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: '審核中',
  approved: '已核准',
  rejected: '未通過',
};

export default function PhotoContributionControls({
  productId,
  userId,
  initialSubmission,
}: {
  productId: number;
  userId: string;
  initialSubmission: ProductPhotoSubmission | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [submission, setSubmission] = useState(initialSubmission);
  const [agreed, setAgreed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!agreed) {
      setError('請先勾選確認事項再上傳照片');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('照片檔案需小於 5MB');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const resized = await resizeImageForUpload(file);
      const path = buildProductPhotoSubmissionPath(userId, productId, resized);
      await uploadProductPhotoSubmission(supabase, path, resized);
      await submitProductPhoto(supabase, userId, productId, path);
      const latest = await fetchMyPhotoSubmission(supabase, userId, productId);
      setSubmission(latest);
      router.refresh();
    } catch {
      setError('提交失敗，請稍後再試');
    } finally {
      setUploading(false);
    }
  }

  async function handleWithdraw() {
    if (!submission) return;
    setError(null);
    try {
      await deleteProductPhotoSubmission(supabase, submission.photo_path);
      await withdrawPhotoSubmission(supabase, submission.id);
      setSubmission(null);
      router.refresh();
    } catch {
      setError('撤回失敗，請稍後再試');
    }
  }

  if (submission && submission.status !== 'rejected') {
    return (
      <div className="rounded border border-neutral-200 p-4 text-sm">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <p>
          你提交的商品照片目前狀態：<span className="font-medium">{STATUS_LABELS[submission.status]}</span>
        </p>
        {submission.status === 'pending' && (
          <button type="button" onClick={handleWithdraw} className="mt-2 text-xs text-neutral-500 underline">
            撤回提交
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <p className="text-sm font-medium">這個商品還沒有代表照，要不要幫忙補一張？</p>
      {submission?.status === 'rejected' && (
        <p className="text-xs text-neutral-500">你先前提交的照片未通過審核，歡迎重新提交。</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-base font-bold text-red-700">
        僅限上傳自己實際拍攝的實體商品照片，不可使用官方圖片、海報掃描、電繪／描圖等平面美術重製方式。
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
        <span>
          我確認這是我自己實體拍攝的照片，並同意本站得於服務範圍內使用、顯示此照片（審核通過後將公開顯示給所有訪客）。
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-500">上傳照片（jpg/png/webp，單檔上限 5MB，會自動壓縮，審核通過後才會公開顯示）</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={uploading || !agreed}
        />
      </label>
      {uploading && <p className="text-xs text-neutral-500">上傳中…</p>}
    </div>
  );
}
