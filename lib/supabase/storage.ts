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

// 玩家互助補圖（見 PROJECT_PROGRESS.md 第30項）：候選圖審核前存放於 private bucket，
// 審核通過後由審核腳本搬到 public bucket 並寫入 products.official_photo_path。
export const PRODUCT_PHOTO_PENDING_BUCKET = 'product-photo-pending';
export const PRODUCT_PHOTOS_BUCKET = 'product-photos';

export function buildProductPhotoSubmissionPath(userId: string, productId: number, file: File): string {
  const ext = file.name.split('.').pop() || 'jpg';
  return `${userId}/${productId}/${Date.now()}.${ext}`;
}

export async function uploadProductPhotoSubmission(
  supabase: SupabaseClient,
  path: string,
  file: File
): Promise<void> {
  const { error } = await supabase.storage
    .from(PRODUCT_PHOTO_PENDING_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
}

export async function deleteProductPhotoSubmission(supabase: SupabaseClient, path: string): Promise<void> {
  const { error } = await supabase.storage.from(PRODUCT_PHOTO_PENDING_BUCKET).remove([path]);
  if (error) throw error;
}

// product-photos 是 public bucket，公開網址只是固定格式的字串組合，不需要 supabase client、
// 也不需要簽名，因此刻意設計成不吃 SupabaseClient 參數，Server/Client Component 都能直接呼叫。
export function getOfficialProductPhotoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_PHOTOS_BUCKET}/${path}`;
}
