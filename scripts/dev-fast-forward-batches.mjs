// 開發測試用：把指定帳號目前所有「生產中」批次的 ready_at 撥到現在，讓它們立刻變成可收成，
// 不用真的等 10~30 分鐘（見 PROJECT_PROGRESS.md 第10-1項測試策略：作弊能力只留在本機腳本，
// 之前是每次手動下 SQL 做這件事，現在存成腳本方便之後重複用，尤其是測試 MachineScene 的
// 「運作中→已完成」視覺切換時很常需要這個）。
// 用法：node --env-file=.env.local scripts/dev-fast-forward-batches.mjs <email或user_id>

import { createClient } from '@supabase/supabase-js';

const [, , idOrEmail] = process.argv;

if (!idOrEmail) {
  console.error('用法：node --env-file=.env.local scripts/dev-fast-forward-batches.mjs <email或user_id>');
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

async function resolveUserId(idOrEmail) {
  if (idOrEmail.includes('@')) {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    const user = data.users.find((u) => u.email === idOrEmail);
    if (!user) throw new Error(`找不到 email 為 ${idOrEmail} 的使用者`);
    return user.id;
  }
  return idOrEmail;
}

async function main() {
  const userId = await resolveUserId(idOrEmail);

  const { data, error } = await supabase
    .from('factory_production_batches')
    .update({ ready_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .select('id, machine_key, format_key, quantity');
  if (error) throw error;

  if (!data || data.length === 0) {
    console.log('這個帳號目前沒有任何生產中的批次可以快轉。');
    return;
  }
  console.log(`已把 ${data.length} 筆生產中的批次撥到現在，重新整理 /factory 就會看到它們變成可收成：`);
  for (const batch of data) {
    console.log(`  - #${batch.id} ${batch.machine_key}/${batch.format_key} × ${batch.quantity}`);
  }
}

main().catch((err) => {
  console.error('執行過程發生錯誤：', err);
  process.exit(1);
});
