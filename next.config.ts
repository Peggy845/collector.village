import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚠️ 臨時關閉，測試dev模式下StrictMode雙重掛載造成three.js WebGL context崩潰的問題，測完記得評估要不要留著
  reactStrictMode: false,
  async headers() {
    // 只在去背測試頁開 COOP/COEP，讓WASM可以多執行緒（單執行緒實測太慢）。
    // 不能開在全站，因為會擋掉沒有CORP標頭的跨源資源（例如Supabase Storage圖片）。
    return [
      {
        source: '/dream-room/bg-removal-test',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;
