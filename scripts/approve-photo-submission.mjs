// 審核通過玩家提交的商品候選圖：把檔案從待審 bucket 搬到公開 bucket，寫入 products.official_photo_path，
// 標記提交狀態為 approved，並在 game_currency_ledger 記一筆 +10 遊戲幣獎勵。
// 用法：node --env-file=.env.local scripts/approve-photo-submission.mjs <submission_id>
//
// 對應 PROJECT_PROGRESS.md 第30項：站長本人審核，不做後台UI，直接跑腳本；
// 遊戲幣帳本設計見第10-1項（帳本式，只累加不改餘額欄位）。

import { createClient } from '@supabase/supabase-js';

const submissionId = Number(process.argv[2]);
if (!submissionId) {
  console.error('用法：node --env-file=.env.local scripts/approve-photo-submission.mjs <submission_id>');
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

const PENDING_BUCKET = 'product-photo-pending';
const PUBLIC_BUCKET = 'product-photos';
const REWARD_AMOUNT = 10;

async function main() {
  const { data: submission, error: fetchErr } = await supabase
    .from('product_photo_submissions')
    .select('*')
    .eq('id', submissionId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!submission) {
    console.error(`找不到 submission id=${submissionId}`);
    process.exit(1);
  }
  if (submission.status !== 'pending') {
    console.error(`此提交狀態已經是「${submission.status}」，不是 pending，未執行任何動作。`);
    process.exit(1);
  }

  const { data: fileBlob, error: downloadErr } = await supabase.storage
    .from(PENDING_BUCKET)
    .download(submission.photo_path);
  if (downloadErr) throw downloadErr;

  const ext = submission.photo_path.split('.').pop() || 'jpg';
  const publicPath = `${submission.product_id}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(PUBLIC_BUCKET)
    .upload(publicPath, fileBlob, { upsert: true, contentType: fileBlob.type || 'image/jpeg' });
  if (uploadErr) throw uploadErr;

  const { error: updateProductErr } = await supabase
    .from('products')
    .update({ official_photo_path: publicPath })
    .eq('id', submission.product_id);
  if (updateProductErr) throw updateProductErr;

  const { error: updateSubmissionErr } = await supabase
    .from('product_photo_submissions')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', submissionId);
  if (updateSubmissionErr) throw updateSubmissionErr;

  await supabase.storage.from(PENDING_BUCKET).remove([submission.photo_path]);

  const { error: ledgerErr } = await supabase.from('game_currency_ledger').insert({
    user_id: submission.submitted_by,
    amount: REWARD_AMOUNT,
    reason: `photo_submission_approved:product_id=${submission.product_id}`,
  });
  if (ledgerErr) throw ledgerErr;

  console.log(`已核准 submission id=${submissionId}，商品 ${submission.product_id} 的公版代表照已上線：${publicPath}`);
  console.log(
    `已記錄 +${REWARD_AMOUNT} 遊戲幣到 user_id=${submission.submitted_by} 的帳本（遊戲幣系統本身尚未正式建置，此為帳本雛形，見第10-1項）。`
  );
}

main().catch((err) => {
  console.error('執行過程發生錯誤：', err);
  process.exit(1);
});
