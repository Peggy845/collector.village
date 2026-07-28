'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Header() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setLoggedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="border-b border-neutral-200 px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href={loggedIn ? '/town' : '/'} className="text-sm font-semibold">
          Collector.Village
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/browse" className="text-neutral-600 hover:text-neutral-900">
            收藏庫瀏覽
          </Link>
          {loggedIn && (
            <>
              <Link href="/dashboard" className="text-neutral-600 hover:text-neutral-900">
                我的收藏
              </Link>
              <Link href="/wishlist" className="text-neutral-600 hover:text-neutral-900">
                想要清單
              </Link>
              <Link href="/settings" className="text-neutral-600 hover:text-neutral-900">
                個人設定
              </Link>
              <button type="button" onClick={handleLogout} className="text-neutral-600 underline hover:text-neutral-900">
                登出
              </button>
            </>
          )}
          {loggedIn === false && (
            <>
              <Link href="/login" className="text-neutral-600 hover:text-neutral-900">
                登入
              </Link>
              <Link href="/register" className="rounded bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700">
                註冊
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
