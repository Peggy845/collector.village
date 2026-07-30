// 駁回玩家提交的商品候選圖：標記狀態為 rejected 並刪除暫存檔案釋放 Storage 空間。
// 用法：node --env-file=.env.local scripts/reject-photo-submission.mjs <submission_id>
//
// 對應 PROJECT_PROGRESS.md 第30項：站長本人審核，不做後台UI，直接跑腳本。

import { createClient } from '@supabase/supabase-js';

const submissionId = Number(process.argv[2]);
if (!submissionId) {
  console.error('用法：node --env-file=.env.local scripts/reject-photo-submission.mjs <submission_id>');
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

  const { error: updateErr } = await supabase
    .from('product_photo_submissions')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', submissionId);
  if (updateErr) throw updateErr;

  await supabase.storage.from(PENDING_BUCKET).remove([submission.photo_path]);

  console.log(`已駁回 submission id=${submissionId}，並刪除暫存檔案釋放空間。`);
}

main().catch((err) => {
  console.error('執行過程發生錯誤：', err);
  process.exit(1);
});
