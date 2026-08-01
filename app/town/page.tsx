import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/auth';

export const metadata: Metadata = {
  title: '小鎮總覽 | Collector.Village',
  robots: { index: false, follow: false },
};

const OPEN_BUILDINGS = [
  { href: '/dashboard', emoji: '📚', name: '圖書館', desc: '我的收藏紀錄' },
  { href: '/browse', emoji: '🏠', name: '家', desc: '收藏庫瀏覽與想要清單' },
  { href: '/albums', emoji: '📔', name: '收納冊', desc: '整理收藏、產生分享連結' },
  { href: '/factory', emoji: '🏭', name: '工廠', desc: '生產二創周邊、賺遊戲幣' },
  { href: '/market', emoji: '🏪', name: '超市', desc: '上架貨架，把成品變現' },
];

const FUTURE_BUILDINGS = [
  { emoji: '🎪', name: '市集' },
  { emoji: '👗', name: '服飾店' },
];

export default async function TownPage() {
  const supabase = await createClient();
  await requireUser(supabase, '/town');

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">小鎮總覽</h1>
        <p className="mt-1 text-sm text-neutral-500">歡迎回到你的收藏小鎮。</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {OPEN_BUILDINGS.map((b) => (
          <Link
            key={b.href}
            href={b.href}
            className="flex flex-col items-center gap-2 rounded-lg border border-neutral-200 p-6 text-center transition hover:border-neutral-400"
          >
            <span className="text-4xl">{b.emoji}</span>
            <span className="text-sm font-medium">{b.name}</span>
            <span className="text-xs text-neutral-500">{b.desc}</span>
          </Link>
        ))}
        {FUTURE_BUILDINGS.map((b) => (
          <div
            key={b.name}
            className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-200 p-6 text-center opacity-40"
          >
            <span className="text-4xl grayscale">{b.emoji}</span>
            <span className="text-sm font-medium">{b.name}</span>
            <span className="text-xs text-neutral-400">敬請期待</span>
          </div>
        ))}
      </div>
    </main>
  );
}
