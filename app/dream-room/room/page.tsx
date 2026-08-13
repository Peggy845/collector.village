import type { Metadata } from 'next';
import RoomDecorator from '@/components/dream-room/RoomDecorator';

export const metadata: Metadata = {
  title: '房間布置 | Collector.Village',
};

export default function DreamRoomLayoutPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="mb-1 text-[22px] font-extrabold tracking-wide">
          房間布置 <span className="text-[#E88AA0]">· 夢幻房間</span>
        </h1>
        <p className="text-[13px] leading-relaxed text-neutral-500">
          把娃娃放進展示層架，看看擺不擺得下——系統會在背後精算真實尺寸，
          <br />
          但畫面上不會出現任何數字，只用顏色跟動畫告訴你結果。
        </p>
      </header>

      <RoomDecorator />
    </main>
  );
}
