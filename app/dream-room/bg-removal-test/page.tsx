'use client';

import Link from 'next/link';
import { useState } from 'react';

type Result = {
  fileName: string;
  originalUrl: string;
  resultUrl: string;
  ms: number;
};

export default function BgRemovalTestPage() {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      for (const file of Array.from(files)) {
        const originalUrl = URL.createObjectURL(file);
        const start = performance.now();
        const blob = await removeBackground(file);
        const ms = Math.round(performance.now() - start);
        const resultUrl = URL.createObjectURL(blob);
        setResults((prev) => [...prev, { fileName: file.name, originalUrl, resultUrl, ms }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <Link href="/dream-room/room" className="text-sm text-[#8a7362] hover:underline">
        ← 回到房間布置
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-[#4a3a2e]">自動去背技術驗證（測試場）</h1>
      <p className="mt-2 text-sm text-[#8a7362]">
        測試瀏覽器端 WASM 去背（<code>@imgly/background-removal</code>）在真實娃娃照片上的效果與速度，
        不需要任何後端服務。選一張或多張照片，會顯示原圖、去背結果、花費時間。
      </p>
      <div className="mt-6">
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
          className="block text-sm text-[#4a3a2e]"
        />
        {busy && <p className="mt-2 text-sm text-[#8a7362]">處理中（第一次會下載模型，可能較久）…</p>}
        {error && <p className="mt-2 text-sm text-red-600">失敗：{error}</p>}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {results.map((r, i) => (
          <div key={i} className="rounded-2xl border border-[#e0d3c2] p-4">
            <p className="mb-2 text-sm font-medium text-[#4a3a2e]">
              {r.fileName}（{r.ms}ms）
            </p>
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="mb-1 text-xs text-[#8a7362]">原圖</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.originalUrl} alt="原圖" className="w-full rounded-lg" />
              </div>
              <div
                className="flex-1 rounded-lg"
                style={{
                  backgroundImage:
                    'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 16px 16px',
                }}
              >
                <p className="mb-1 text-xs text-[#8a7362]">去背結果</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.resultUrl} alt="去背結果" className="w-full rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
