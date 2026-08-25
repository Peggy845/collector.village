'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { addCustomItem, loadCustomItems, removeCustomItem, type CustomRoomItem } from '@/lib/dream-room/customItems';

// 對應第七節第9點定案的欄位（照片正反面、IP名稱、角色名稱、娃娃全名）+ 第六節第2點
// 「尺寸資料可選填」——這裡用預先填好的常見絨毛娃娃尺寸當預設值，玩家不填也能送出，
// 不強制先量好尺寸才能玩（真要精準，之後可以再回來改，但這一版沒有做「編輯」功能，
// 想改的話用下面的刪除+重新新增）。
const DEFAULT_WIDTH_CM = 10;
const DEFAULT_HEIGHT_CM = 15;
const DEFAULT_DEPTH_CM = 8;

const MAX_STORED_DIM_PX = 600; // 呼應scripts/crop-plush-photo.mjs既有慣例，存進localStorage前先壓縮

async function removeBackgroundToDataUrl(file: File): Promise<string> {
  const { removeBackground } = await import('@imgly/background-removal');
  const blob = await removeBackground(file);
  return resizeBlobToDataUrl(blob, MAX_STORED_DIM_PX);
}

function resizeBlobToDataUrl(blob: Blob, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('無法建立canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('圖片載入失敗'));
    img.src = URL.createObjectURL(blob);
  });
}

type PhotoSlot = { status: 'idle' } | { status: 'processing' } | { status: 'done'; dataUrl: string } | { status: 'error'; message: string };

function PhotoPicker({
  label,
  required,
  slot,
  onFile,
}: {
  label: string;
  required?: boolean;
  slot: PhotoSlot;
  onFile: (file: File) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-[#4a3a2e]">
        {label}
        {required && <span className="ml-1 text-[#E88AA0]">*</span>}
      </p>
      <input
        type="file"
        accept="image/*"
        disabled={slot.status === 'processing'}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
        className="block text-sm text-[#4a3a2e]"
      />
      {slot.status === 'processing' && <p className="mt-1 text-xs text-[#8a7362]">去背處理中（第一次會下載模型，可能要一段時間）…</p>}
      {slot.status === 'error' && <p className="mt-1 text-xs text-red-600">失敗：{slot.message}</p>}
      {slot.status === 'done' && (
        <div
          className="mt-2 h-24 w-24 rounded-lg"
          style={{ backgroundImage: 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 14px 14px' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.dataUrl} alt="去背預覽" className="h-full w-full object-contain" />
        </div>
      )}
    </div>
  );
}

export default function AddItemPage() {
  const [ipName, setIpName] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [fullName, setFullName] = useState('');
  const [widthCm, setWidthCm] = useState(String(DEFAULT_WIDTH_CM));
  const [heightCm, setHeightCm] = useState(String(DEFAULT_HEIGHT_CM));
  const [depthCm, setDepthCm] = useState(String(DEFAULT_DEPTH_CM));
  const [frontSlot, setFrontSlot] = useState<PhotoSlot>({ status: 'idle' });
  const [backSlot, setBackSlot] = useState<PhotoSlot>({ status: 'idle' });
  const [saved, setSaved] = useState<CustomRoomItem[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    // 同lib/dream-room/useRoomItems.ts的理由：避免SSR/client初次render對不上觸發hydration mismatch。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(loadCustomItems());
  }, []);

  async function handleFrontFile(file: File) {
    setFrontSlot({ status: 'processing' });
    try {
      const dataUrl = await removeBackgroundToDataUrl(file);
      setFrontSlot({ status: 'done', dataUrl });
    } catch (err) {
      setFrontSlot({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleBackFile(file: File) {
    setBackSlot({ status: 'processing' });
    try {
      const dataUrl = await removeBackgroundToDataUrl(file);
      setBackSlot({ status: 'done', dataUrl });
    } catch (err) {
      setBackSlot({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const canSave = frontSlot.status === 'done' && fullName.trim().length > 0;

  function handleSave() {
    if (frontSlot.status !== 'done') return;
    const item: CustomRoomItem = {
      id: `custom-${crypto.randomUUID()}`,
      image: frontSlot.dataUrl,
      backImage: backSlot.status === 'done' ? backSlot.dataUrl : undefined,
      realWidthCm: Number(widthCm) || DEFAULT_WIDTH_CM,
      realHeightCm: Number(heightCm) || DEFAULT_HEIGHT_CM,
      realDepthCm: Number(depthCm) || DEFAULT_DEPTH_CM,
      ipName: ipName.trim(),
      characterName: characterName.trim(),
      fullName: fullName.trim(),
    };
    setSaved(addCustomItem(item));
    setIpName('');
    setCharacterName('');
    setFullName('');
    setWidthCm(String(DEFAULT_WIDTH_CM));
    setHeightCm(String(DEFAULT_HEIGHT_CM));
    setDepthCm(String(DEFAULT_DEPTH_CM));
    setFrontSlot({ status: 'idle' });
    setBackSlot({ status: 'idle' });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 3000);
  }

  function handleDelete(id: string) {
    setSaved(removeCustomItem(id));
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/dream-room/room" className="text-sm text-[#8a7362] hover:underline">
        ← 回到房間布置
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-[#4a3a2e]">新增我自己的收藏</h1>
      <p className="mt-2 text-sm text-[#8a7362]">
        拍你實際擁有的娃娃/公仔照片，會自動去背（瀏覽器本地處理，不會上傳到任何伺服器）。
        存好之後就可以在夾娃娃機、房間布置的收藏匣裡看到牠。尺寸沒量也沒關係，先用預設值，好玩最重要。
      </p>

      <div className="mt-6 space-y-5 rounded-2xl border border-[#e0d3c2] p-5">
        <PhotoPicker label="正面照片" required slot={frontSlot} onFile={handleFrontFile} />
        <PhotoPicker label="背面照片（選填）" slot={backSlot} onFile={handleBackFile} />

        <div>
          <label className="mb-1 block text-sm font-medium text-[#4a3a2e]">
            娃娃全名<span className="ml-1 text-[#E88AA0]">*</span>
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="例如：進擊的巨人 もちころりん 艾爾文"
            className="w-full rounded-lg border border-[#e0d3c2] px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#4a3a2e]">IP名稱</label>
            <input
              type="text"
              value={ipName}
              onChange={(e) => setIpName(e.target.value)}
              placeholder="例如：進擊的巨人"
              className="w-full rounded-lg border border-[#e0d3c2] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#4a3a2e]">角色名稱</label>
            <input
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="例如：艾爾文"
              className="w-full rounded-lg border border-[#e0d3c2] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-[#4a3a2e]">真實尺寸（公分，選填，預設一般絨毛娃娃大小）</p>
          <div className="grid grid-cols-3 gap-3">
            <input
              type="number"
              min={1}
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
              placeholder="寬"
              className="w-full rounded-lg border border-[#e0d3c2] px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="高"
              className="w-full rounded-lg border border-[#e0d3c2] px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              value={depthCm}
              onChange={(e) => setDepthCm(e.target.value)}
              placeholder="厚度"
              className="w-full rounded-lg border border-[#e0d3c2] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="w-full rounded-full bg-[#E88AA0] px-6 py-3 text-sm font-bold text-white shadow-[0_4px_0_#C96E85] transition-transform active:translate-y-[3px] active:shadow-[0_1px_0_#C96E85] disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-[0_4px_0_#c3b8af]"
        >
          存下這隻娃娃
        </button>
        {justSaved && <p className="text-center text-sm text-green-600">存好了！去夾娃娃機或房間布置看看牠。</p>}
      </div>

      {saved.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-[#4a3a2e]">已經新增的收藏（{saved.length}）</h2>
          <div className="flex flex-wrap gap-3">
            {saved.map((item) => (
              <div key={item.id} className="relative rounded-xl border border-[#e0d3c2] bg-white p-2">
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#5A4A42] text-xs text-white shadow"
                  title="刪除"
                >
                  ×
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt={item.fullName} className="h-16 w-16 object-contain" />
                <p className="mt-1 max-w-[64px] truncate text-center text-[11px] text-[#8a7362]">{item.fullName}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
