// 站長本人直接設定商品公版代表照，不走審核流程
// （見 PROJECT_PROGRESS.md 第30項：站長自己上傳的圖直接視為公版圖來源，不需要另外審核自己）。
// 用法：node --env-file=.env.local scripts/set-official-photo.mjs <product_id> <本機圖片路徑>

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const [, , productIdArg, filePath] = process.argv;
const productId = Number(productIdArg);

if (!productId || !filePath) {
  console.error('用法：node --env-file=.env.local scripts/set-official-photo.mjs <product_id> <本機圖片路徑>');
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

const PUBLIC_BUCKET = 'product-photos';
const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function main() {
  const ext = extname(filePath).toLowerCase() || '.jpg';
  const contentType = CONTENT_TYPES[ext] || 'image/jpeg';
  const fileBuffer = readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: contentType });
  const publicPath = `${productId}${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(PUBLIC_BUCKET)
    .upload(publicPath, blob, { upsert: true, contentType });
  if (uploadErr) throw uploadErr;

  const { error: updateErr } = await supabase
    .from('products')
    .update({ official_photo_path: publicPath })
    .eq('id', productId);
  if (updateErr) throw updateErr;

  console.log(`商品 ${productId} 的公版代表照已設定為：${publicPath}`);
}

main().catch((err) => {
  console.error('執行過程發生錯誤：', err);
  process.exit(1);
});
