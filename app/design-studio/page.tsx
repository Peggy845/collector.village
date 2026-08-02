import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/supabase/auth';
import { fetchDesignLibraryCapacity, fetchPlayerDesignLibrary } from '@/lib/supabase/design-studio';
import DesignStudioClient from '@/components/design-studio/DesignStudioClient';

export const metadata: Metadata = {
  title: '設計坊 | Collector.Village',
  robots: { index: false, follow: false },
};

export default async function DesignStudioPage() {
  const supabase = await createClient();
  const user = await requireUser(supabase, '/design-studio');

  const [library, libraryCapacity] = await Promise.all([
    fetchPlayerDesignLibrary(supabase, user.id),
    fetchDesignLibraryCapacity(supabase, user.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">設計坊</h1>
          <p className="mt-1 text-sm text-neutral-500">畫一張屬於你的設計圖，拿去工廠生產成周邊。</p>
        </div>
        <Link href="/factory" className="rounded border border-neutral-300 px-3 py-2 text-sm hover:border-neutral-500">
          進入工廠
        </Link>
      </div>

      <p className="rounded border border-dashed border-neutral-300 p-3 text-xs text-neutral-500">
        在此網站設計的圖等同授權給遊戲使用。管理員保證不會做其他用途。如果擔心，請上浮水印。
      </p>

      <DesignStudioClient userId={user.id} library={library} libraryCapacity={libraryCapacity} />
    </main>
  );
}
