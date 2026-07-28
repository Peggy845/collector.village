import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/database';

export async function fetchUserProfile(supabase: SupabaseClient, userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export async function updateUserProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: { username?: string | null; social_links?: Record<string, string> | null }
): Promise<void> {
  const { error } = await supabase.from('users').update(updates).eq('id', userId);
  if (error) throw error;
}
