import type { SupabaseClient } from '@supabase/supabase-js';
import type { OwnedStatus, UserCollectionEntry } from '@/types/database';

// user_collections 的唯一約束是 (user_id, product_id, owned_type)，owned_type 允許 NULL。
// MVP 沒有「同一商品多筆紀錄」的需求（切換三種狀態應該是同一筆紀錄原地更新），
// 但 Postgres 唯一約束預設把多個 NULL 視為互不相同，若持續傳 NULL 會讓約束形同虛設。
// 因此固定用空字串取代 NULL，讓約束確實等同 (user_id, product_id) 唯一。
export const OWNED_TYPE = '';

export async function fetchUserCollectionsByProductIds(
  supabase: SupabaseClient,
  userId: string,
  productIds: number[]
): Promise<Map<number, UserCollectionEntry>> {
  if (productIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('user_collections')
    .select('*')
    .eq('user_id', userId)
    .in('product_id', productIds);

  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.product_id, row as UserCollectionEntry]));
}

export async function fetchUserCollectionsByStatus(
  supabase: SupabaseClient,
  userId: string,
  status: OwnedStatus
): Promise<UserCollectionEntry[]> {
  const { data, error } = await supabase
    .from('user_collections')
    .select('*')
    .eq('user_id', userId)
    .eq('owned_status', status);
  if (error) throw error;
  return (data ?? []) as UserCollectionEntry[];
}

export async function fetchAllUserCollections(
  supabase: SupabaseClient,
  userId: string
): Promise<UserCollectionEntry[]> {
  const { data, error } = await supabase.from('user_collections').select('*').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as UserCollectionEntry[];
}

export async function fetchUserCollectionForProduct(
  supabase: SupabaseClient,
  userId: string,
  productId: number
): Promise<UserCollectionEntry | null> {
  const { data, error } = await supabase
    .from('user_collections')
    .select('*')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .eq('owned_type', OWNED_TYPE)
    .maybeSingle();

  if (error) throw error;
  return data as UserCollectionEntry | null;
}

export async function upsertOwnedStatus(
  supabase: SupabaseClient,
  userId: string,
  productId: number,
  status: OwnedStatus
): Promise<void> {
  const { error } = await supabase.from('user_collections').upsert(
    {
      user_id: userId,
      product_id: productId,
      owned_type: OWNED_TYPE,
      owned_status: status,
    },
    { onConflict: 'user_id,product_id,owned_type' }
  );

  if (error) throw error;
}

export async function updateCollectionDetails(
  supabase: SupabaseClient,
  userId: string,
  productId: number,
  details: { note?: string | null; acquiredDate?: string | null; photoUrl?: string | null }
): Promise<void> {
  const updates: Record<string, string | null> = {};
  if ('note' in details) updates.note = details.note ?? null;
  if ('acquiredDate' in details) updates.acquired_date = details.acquiredDate ?? null;
  if ('photoUrl' in details) updates.photo_url = details.photoUrl ?? null;

  const { error } = await supabase
    .from('user_collections')
    .update(updates)
    .eq('user_id', userId)
    .eq('product_id', productId)
    .eq('owned_type', OWNED_TYPE);

  if (error) throw error;
}

export async function removeCollectionEntry(
  supabase: SupabaseClient,
  userId: string,
  productId: number
): Promise<void> {
  const { error } = await supabase
    .from('user_collections')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId)
    .eq('owned_type', OWNED_TYPE);

  if (error) throw error;
}

