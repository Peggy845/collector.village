import type { SupabaseClient } from '@supabase/supabase-js';

export const COLLECTION_PHOTOS_BUCKET = 'collection-photos';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 小時，僅供單次頁面瀏覽使用

// 路徑階層 user_id/product_id/檔名，天然對應 RLS 政策與隱私規則（見 supabase/schema.sql）。
export function buildPhotoPath(userId: string, productId: number, file: File): string {
  const ext = file.name.split('.').pop() || 'jpg';
  return `${userId}/${productId}/${Date.now()}.${ext}`;
}

export async function uploadCollectionPhoto(
  supabase: SupabaseClient,
  path: string,
  file: File
): Promise<void> {
  const { error } = await supabase.storage
    .from(COLLECTION_PHOTOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
}

export async function getCollectionPhotoSignedUrl(
  supabase: SupabaseClient,
  path: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(COLLECTION_PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteCollectionPhoto(supabase: SupabaseClient, path: string): Promise<void> {
  const { error } = await supabase.storage.from(COLLECTION_PHOTOS_BUCKET).remove([path]);
  if (error) throw error;
}
