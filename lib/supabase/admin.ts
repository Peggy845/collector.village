import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// 具完整權限，繞過 RLS。僅供伺服器端管理操作使用（例如帳號刪除、商品回報審核搬移資料）。
// import 'server-only' 會讓這支檔案一旦被瀏覽器端程式碼 import 就建置失敗，避免金鑰外洩。
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
