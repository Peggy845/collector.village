// 新增工廠系統的設計圖庫素材（見 PROJECT_PROGRESS.md 已定案項目 31：v1 由 Peggy 自行尋找可商用圖片，
// 不開放玩家上傳）。上傳到 public bucket 並寫入 factory_designs 表，馬上就能在 /factory 選圖生產。
//
// 用法：
//   node --env-file=.env.local scripts/add-factory-design.mjs <本機圖片路徑> [顯示名稱]
//   node --env-file=.env.local scripts/add-factory-design.mjs --text "顯示文字"
//     （正式圖庫還沒準備好之前，先用純文字色塊佔位，前端沒有圖片時會自動改顯示這段文字）

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { extname, basename } from 'node:path';

const [, , first, second] = process.argv;

if (!first) {
  console.error(
    '用法：node --env-file=.env.local scripts/add-factory-design.mjs <本機圖片路徑> [顯示名稱]\n' +
      '或：  node --env-file=.env.local scripts/add-factory-design.mjs --text "顯示文字"'
  );
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，請確認 .env.local 並用 --env-file 執行。');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = 'factory-designs';
const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function main() {
  if (first === '--text') {
    const text = second;
    if (!text) {
      console.error('用法：node --env-file=.env.local scripts/add-factory-design.mjs --text "顯示文字"');
      process.exit(1);
    }
    const { error: insertErr } = await supabase.from('factory_designs').insert({ storage_path: null, name: text });
    if (insertErr) throw insertErr;
    console.log(`已新增文字佔位設計圖：${text}`);
    return;
  }

  const filePath = first;
  const displayName = second;
  const ext = extname(filePath).toLowerCase() || '.jpg';
  const contentType = CONTENT_TYPES[ext] || 'image/jpeg';
  const fileBuffer = readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: contentType });
  const storagePath = `${Date.now()}-${basename(filePath)}`;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, blob, {
    upsert: true,
    contentType,
  });
  if (uploadErr) throw uploadErr;

  const { error: insertErr } = await supabase
    .from('factory_designs')
    .insert({ storage_path: storagePath, name: displayName ?? basename(filePath) });
  if (insertErr) throw insertErr;

  console.log(`已新增設計圖：${storagePath}`);
}

main().catch((err) => {
  console.error('執行過程發生錯誤：', err);
  process.exit(1);
});
