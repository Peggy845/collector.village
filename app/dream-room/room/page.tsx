import type { Metadata } from 'next';
import Link from 'next/link';
import RoomScene3DLoader from '@/components/dream-room/RoomScene3DLoader';

export const metadata: Metadata = {
  title: '房間布置 | Collector.Village',
};

export default function DreamRoomLayoutPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="mb-1 text-[22px] font-extrabold tracking-wide">
          房間布置 <span className="text-[#E88AA0]">· 夢幻房間</span>
        </h1>
        <p className="text-[13px] leading-relaxed text-neutral-500">
          把娃娃拖到書櫃或堆疊箱上放上去，看看擺不擺得下——系統會在背後精算真實尺寸，
          <br />
          但畫面上不會出現任何數字，只用視覺擠壓告訴你結果。摸空白處可以自由旋轉鏡頭。
        </p>
      </header>

      <RoomScene3DLoader />

      <p className="text-center text-xs text-neutral-400">
        還有洞洞板可以放：
        <Link href="/dream-room/room/pegboard" className="underline hover:text-neutral-600">
          洞洞板（舊版介面）
        </Link>
      </p>
    </main>
  );
}
