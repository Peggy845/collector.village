import { redirect } from 'next/navigation';
import type { SupabaseClient, User } from '@supabase/supabase-js';

// 共用的登入檢查：未登入時導向登入頁，並帶上 redirect 參數，
// 讓使用者登入完成後直接返回原本要看的頁面（見 PROJECT_PROGRESS.md 第13項）。
export async function requireUser(supabase: SupabaseClient, redirectTo: string): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
  }

  return user;
}
