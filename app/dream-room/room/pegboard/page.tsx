import type { Metadata } from 'next';
import Link from 'next/link';
import PegboardDecoratorLegacy from '@/components/dream-room/PegboardDecoratorLegacy';

export const metadata: Metadata = {
  title: '洞洞板（舊版）| Collector.Village',
};

export default function PegboardLegacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="mb-1 text-[22px] font-extrabold tracking-wide">
          洞洞板 <span className="text-[#E88AA0]">· 舊版介面</span>
        </h1>
        <p className="text-[13px] leading-relaxed text-neutral-500">
          房間布置已經換成真3D場景，但洞洞板還沒做3D版，先留這個獨立入口繼續用。
          <br />
          之前放上去的娃娃都還在，不會不見。
        </p>
      </header>

      <PegboardDecoratorLegacy />

      <p className="text-center text-xs text-neutral-400">
        <Link href="/dream-room/room" className="underline hover:text-neutral-600">
          回到房間布置（3D）
        </Link>
      </p>
    </main>
  );
}
