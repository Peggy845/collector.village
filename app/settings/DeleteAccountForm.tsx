'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const CONFIRM_PHRASE = '刪除帳號';

export default function DeleteAccountForm() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (confirmText !== CONFIRM_PHRASE) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '刪除失敗');
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗，請稍後再試');
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        請輸入「{CONFIRM_PHRASE}」以確認
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={confirmText !== CONFIRM_PHRASE || deleting}
        className="self-start rounded bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {deleting ? '刪除中…' : '永久刪除帳號'}
      </button>
    </form>
  );
}
