import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductPhotoSubmission } from '@/types/database';

// 玩家互助補圖（見 PROJECT_PROGRESS.md 第30項）：v1 只在商品完全沒有公版代表照時開放提交，
// 一旦有一筆提交在審核中或已核准，同一使用者不需要（也不應該）再重複提交，前端據此決定要顯示
// 「提交候選圖」表單，還是顯示既有提交的狀態。

export async function fetchMyPhotoSubmission(
  supabase: SupabaseClient,
  userId: string,
  productId: number
): Promise<ProductPhotoSubmission | null> {
  const { data, error } = await supabase
    .from('product_photo_submissions')
    .select('*')
    .eq('submitted_by', userId)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as ProductPhotoSubmission | null;
}

export async function submitProductPhoto(
  supabase: SupabaseClient,
  userId: string,
  productId: number,
  photoPath: string
): Promise<void> {
  const { error } = await supabase.from('product_photo_submissions').insert({
    product_id: productId,
    submitted_by: userId,
    photo_path: photoPath,
    status: 'pending',
  });
  if (error) throw error;
}

export async function withdrawPhotoSubmission(supabase: SupabaseClient, submissionId: number): Promise<void> {
  const { error } = await supabase.from('product_photo_submissions').delete().eq('id', submissionId);
  if (error) throw error;
}
