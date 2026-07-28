import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 承接 Email 驗證信與忘記密碼信件裡的連結：Supabase 會帶著 code 導回這裡，
// 交換成 session 後再依 next 參數導向原本要去的頁面（見 5.1 節未登入導向規則）。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/town';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
