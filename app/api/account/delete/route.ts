import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { COLLECTION_PHOTOS_BUCKET } from '@/lib/supabase/storage';
import type { SupabaseClient } from '@supabase/supabase-js';

// Storage 沒有遞迴刪除資料夾的 API，路徑階層是 user_id/product_id/檔名（兩層），
// 所以要先列出 user_id 底下每個 product_id 子資料夾，再逐一列出檔案後一次刪除。
async function listAllFilesUnderPrefix(admin: SupabaseClient, prefix: string): Promise<string[]> {
  const { data } = await admin.storage.from(COLLECTION_PHOTOS_BUCKET).list(prefix, { limit: 1000 });
  const paths: string[] = [];
  for (const item of data ?? []) {
    const fullPath = `${prefix}/${item.name}`;
    if (item.id === null) {
      paths.push(...(await listAllFilesUnderPrefix(admin, fullPath)));
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '未登入' }, { status: 401 });
  }

  const admin = createAdminClient();

  const photoPaths = await listAllFilesUnderPrefix(admin, user.id);
  if (photoPaths.length > 0) {
    await admin.storage.from(COLLECTION_PHOTOS_BUCKET).remove(photoPaths);
  }

  // public.users / user_collections / product_submissions 皆設有 ON DELETE CASCADE 對應 auth.users(id)，
  // 刪除 auth 使用者即可連帶清除，見 supabase/schema.sql。
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
