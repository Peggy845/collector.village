'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';

const ThreeDShelfSpike = dynamic(() => import('@/components/dream-room/ThreeDShelfSpike'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] w-full items-center justify-center rounded-3xl bg-[#2b2420] text-[#e8d9c9]">
      載入3D場景中…
    </div>
  ),
});

export default function ThreeDTestPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <Link href="/dream-room/room" className="text-sm text-[#8a7362] hover:underline">
        ← 回到房間布置
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-[#4a3a2e]">真3D技術驗證（不是正式功能）</h1>
      <p className="mt-2 text-sm text-[#8a7362]">
        測試「鏡頭自由旋轉 + 娃娃用真實寬高深貼照片box + 摸娃娃拖曳/摸空白轉鏡頭」的手感。
        直接摸空白處拖曳可以自由旋轉視角、滾輪縮放；按住娃娃本體拖曳則會暫時關掉鏡頭旋轉，改成左右移動娃娃。
        右邊那隻（plush-3）深度10cm，格子深度只有8cm，故意讓它從展示格開口頂出來2cm，測試「硬塞會被擠出去」在真3D下看起來如何。
      </p>
      <div className="mt-6">
        <ThreeDShelfSpike />
      </div>
    </main>
  );
}
