'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 6) {
      setError('密碼至少需要 6 個字元');
      return;
    }
    if (password !== confirmPassword) {
      setError('兩次輸入的密碼不一致');
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setPassword('');
    setConfirmPassword('');
    setMessage('密碼已更新');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        新密碼
        <input
          type="password"
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        確認新密碼
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
      <button
        type="submit"
        disabled={saving}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {saving ? '更新中…' : '更新密碼'}
      </button>
    </form>
  );
}
