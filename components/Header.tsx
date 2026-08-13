'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface NotificationSummary {
  readyBatches: number;
  furnitureNeedingRestock: number;
  warehouseEmpty: boolean;
}

// 輪詢間隔刻意抓長一點（不是即時通知），這只是「玩家自己開著網頁時會看到的提醒」，
// 不用很即時（見 app/api/notifications/summary/route.ts 的說明：不用瀏覽器推播、不改分頁標題）。
const NOTIFICATION_POLL_MS = 45000;

export default function Header() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [notif, setNotif] = useState<NotificationSummary | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setLoggedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/notifications/summary');
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setNotif(body);
      } catch {
        // 提醒是錦上添花的功能，讀取失敗就靜默略過，不打擾使用者、不用跳錯誤訊息。
      }
    }
    poll();
    const interval = setInterval(poll, NOTIFICATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loggedIn]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const hasNotif =
    !!loggedIn && !!notif && (notif.readyBatches > 0 || notif.furnitureNeedingRestock > 0 || notif.warehouseEmpty);

  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href={loggedIn ? '/town' : '/'} className="text-sm font-semibold">
          Collector.Village
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/browse" className="text-neutral-600 hover:text-neutral-900">
            收藏庫瀏覽
          </Link>
          <Link href="/dream-room" className="text-neutral-600 hover:text-neutral-900">
            夾娃娃機
          </Link>
          <Link href="/dream-room/room" className="text-neutral-600 hover:text-neutral-900">
            房間布置
          </Link>
          {loggedIn && (
            <>
              <Link href="/dashboard" className="text-neutral-600 hover:text-neutral-900">
                我的收藏
              </Link>
              <Link href="/wishlist" className="text-neutral-600 hover:text-neutral-900">
                想要清單
              </Link>
              <Link href="/albums" className="text-neutral-600 hover:text-neutral-900">
                我的收納冊
              </Link>
              <Link href="/design-studio" className="text-neutral-600 hover:text-neutral-900">
                設計坊
              </Link>
              <Link href="/factory" className="text-neutral-600 hover:text-neutral-900">
                工廠
              </Link>
              <Link href="/market" className="text-neutral-600 hover:text-neutral-900">
                超市
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
      {/* 動態提醒欄：只在有東西待處理時出現，只存在於這個網頁畫面裡（不是瀏覽器推播），
          切到別的分頁/離開網頁就不會有任何痕跡，安全下班用。 */}
      {hasNotif && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1">
            {notif!.readyBatches > 0 && (
              <Link href="/factory" className="underline hover:text-amber-950">
                🏭 有商品完成，快去收成
              </Link>
            )}
            {notif!.furnitureNeedingRestock > 0 && (
              <Link href="/market" className="underline hover:text-amber-950">
                🏪 有 {notif!.furnitureNeedingRestock} 個家具空了，快去上架
              </Link>
            )}
            {notif!.warehouseEmpty && (
              <Link href="/factory" className="underline hover:text-amber-950">
                📦 工廠倉庫空了，快去生產
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
