'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RegisterForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/town';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('兩次輸入的密碼不一致');
      return;
    }
    if (!agreed) {
      setError('請先閱讀並同意服務條款與隱私權政策');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message === 'User already registered' ? '此 Email 已被註冊過' : signUpError.message);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">請至信箱完成驗證</h1>
        <p className="text-sm text-neutral-600">
          我們已寄出一封驗證信到 {email}，請點擊信中連結完成註冊後再回來登入。
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">註冊</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          密碼
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          確認密碼
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="flex items-start gap-2 text-xs text-neutral-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            我已閱讀並同意
            <Link href="/terms" target="_blank" className="underline">
              服務條款
            </Link>
            與
            <Link href="/privacy" target="_blank" className="underline">
              隱私權政策
            </Link>
            。最低使用年齡為 13 歲；未滿 18 歲需徵得法定代理人同意。
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? '註冊中…' : '註冊'}
        </button>
      </form>
      <p className="text-sm text-neutral-600">
        已經有帳號了？
        <Link
          href={redirectTo !== '/town' ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'}
          className="underline"
        >
          登入
        </Link>
      </p>
    </main>
  );
}
