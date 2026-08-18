'use client';

import dynamic from 'next/dynamic';

// three.js/WebGL不能在伺服器端渲染，用dynamic+ssr:false延到瀏覽器才載入，跟
// app/dream-room/3d-test/page.tsx同樣的作法。page.tsx本身要留server component才能
// export metadata，所以把dynamic import包成獨立的client component給它引用。
const RoomScene3D = dynamic(() => import('@/components/dream-room/RoomScene3D'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[65vh] w-full items-center justify-center rounded-3xl bg-[#2b2420] text-[#e8d9c9]">
      載入房間中…
    </div>
  ),
});

export default function RoomScene3DLoader() {
  return <RoomScene3D />;
}
