import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlayerDesign } from '@/types/database';
import { DEFAULT_DESIGN_LIBRARY_CAPACITY } from '@/lib/design-studio/palette';

export const PLAYER_DESIGNS_BUCKET = 'player-designs';

// 只看 status='library' 的列——「直接生產」建立的暫存設計（status='temp'）不算進設計庫，
// 見 supabase/schema.sql 第12節 player_designs.status 欄位說明。
export async function fetchPlayerDesignLibrary(supabase: SupabaseClient, userId: string): Promise<PlayerDesign[]> {
  const { data, error } = await supabase
    .from('player_designs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'library')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlayerDesign[];
}

export async function fetchPlayerDesignCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('player_designs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'library');
  if (error) throw error;
  return count ?? 0;
}

export async function fetchDesignLibraryCapacity(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('design_library_capacity')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.design_library_capacity ?? DEFAULT_DESIGN_LIBRARY_CAPACITY;
}

// 路徑階層 user_id/檔名，天然對應 storage.objects 的 RLS 政策（見 supabase/schema.sql 第12節）。
export function buildPlayerDesignUploadPath(userId: string): string {
  return `${userId}/${Date.now()}.png`;
}

export async function uploadPlayerDesignImage(supabase: SupabaseClient, path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from(PLAYER_DESIGNS_BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/png' });
  if (error) throw error;
}
