// 開發測試用：直接發放遊戲幣到指定帳號，寫入 game_currency_ledger（見 PROJECT_PROGRESS.md 第10-1項
// 測試策略：作弊能力只存在於本機腳本，不會出現在任何正式玩家能碰到的路徑）。
// 用法：node --env-file=.env.local scripts/dev-grant-currency.mjs <email或user_id> <數量> [原因]

import { createClient } from '@supabase/supabase-js';

const [, , idOrEmail, amountArg, reason] = process.argv;
const amount = Number(amountArg);

if (!idOrEmail || !amount) {
  console.error('用法：node --env-file=.env.local scripts/dev-grant-currency.mjs <email或user_id> <數量> [原因]');
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

  const { error } = await supabase
    .from('game_currency_ledger')
    .insert({ user_id: userId, amount, reason: reason ?? 'dev_grant' });
  if (error) throw error;

  console.log(`已發放 ${amount} 枚遊戲幣給 ${userId}`);
}

main().catch((err) => {
  console.error('執行過程發生錯誤：', err);
  process.exit(1);
});
