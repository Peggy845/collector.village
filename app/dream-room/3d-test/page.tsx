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
        這是接上正式資料層的版本：左邊是書櫃（三層架、單一軸向排隊），右邊新增了透明堆疊箱（2D網格、AABB碰撞），
        兩種完全不同的碰撞邏輯放在同一個場景裡驗證。從下面收藏匣按住娃娃拖到書櫃層架或堆疊箱格子上放上去；
        已經放上去的娃娃也可以直接按住拖曳，換位置、換層架/換格子、跨家具搬（畫面內移動一律是搬移不會複製），或拖回收藏匣移除。
        摸空白處拖曳可以自由旋轉鏡頭；摸娃娃本體拖曳則會暫時關掉鏡頭旋轉，改成移動娃娃。放不下的話會被視覺擠壓，不會顯示任何數字。
      </p>
      <div className="mt-6">
        <ThreeDShelfSpike />
      </div>
    </main>
  );
}
