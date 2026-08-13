import type { Metadata } from 'next';
import Link from 'next/link';
import ClawMachine from '@/components/dream-room/ClawMachine';

export const metadata: Metadata = {
  title: '夾娃娃機 | Collector.Village',
};

export default function DreamRoomPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="mb-1 text-[22px] font-extrabold tracking-wide">
          夾娃娃機 <span className="text-[#E88AA0]">· 夢幻房間</span>
        </h1>
        <p className="text-[13px] leading-relaxed text-neutral-500">
          先不管尺寸，隨手把娃娃夾出來、丟著玩，看看堆起來的感覺。
          <br />
          這些是站長自己的收藏，之後你也可以放上自己的娃娃來玩。
        </p>
      </header>

      <ClawMachine />

      <p className="text-center text-xs text-neutral-400">
        玩夠了嗎？<Link href="/dream-room/room" className="underline hover:text-neutral-600">試試把娃娃放進展示層架</Link>
      </p>
    </main>
  );
}
