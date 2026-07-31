import type { SupabaseClient } from '@supabase/supabase-js';

// 帳本設計（見已定案項目 10-1／31）：只累加不修改，餘額永遠是全部 amount 加總，
// 不額外存一個「餘額」欄位以免跟帳本內容兜不起來。
export async function fetchCurrencyBalance(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('game_currency_ledger')
    .select('amount')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
}
