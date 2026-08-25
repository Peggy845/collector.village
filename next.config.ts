import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚠️ 臨時關閉，測試dev模式下StrictMode雙重掛載造成three.js WebGL context崩潰的問題，測完記得評估要不要留著
  reactStrictMode: false,
  async headers() {
    // 只在會跑瀏覽器端去背的頁面開 COOP/COEP，讓WASM可以多執行緒（單執行緒實測太慢，
    // 見idea/夢幻房間_討論整理.md第十五節）。不能開在全站，因為COEP會擋掉沒有CORP
    // 標頭的跨源資源（例如Supabase Storage圖片），這個網站到處都在讀。
    const coopCoepHeaders = [
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
    ];
    return [
      { source: '/dream-room/bg-removal-test', headers: coopCoepHeaders },
      { source: '/dream-room/add-item', headers: coopCoepHeaders },
    ];
  },
};

export default nextConfig;
