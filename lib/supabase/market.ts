import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketShelf, MarketShelfSlot } from '@/types/database';

export async function fetchShelves(supabase: SupabaseClient, userId: string): Promise<MarketShelf[]> {
  const { data, error } = await supabase
    .from('market_shelves')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MarketShelf[];
}

export async function fetchShelfSlots(supabase: SupabaseClient, userId: string): Promise<MarketShelfSlot[]> {
  // market_shelf_slots 沒有直接存 user_id（見 schema.sql 註解），先查自己有哪些貨架，
  // RLS select 政策也是用同樣的方式（透過 market_shelves.user_id）判斷擁有權。
  const shelves = await fetchShelves(supabase, userId);
  if (shelves.length === 0) return [];

  const { data, error } = await supabase
    .from('market_shelf_slots')
    .select('*')
    .in(
      'shelf_id',
      shelves.map((s) => s.id)
    )
    .order('listed_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MarketShelfSlot[];
}

export async function fetchWarehouseCapacity(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('warehouse_capacity')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.warehouse_capacity ?? 300;
}

export interface MarketOpenState {
  open: boolean;
  closedAt: string | null;
}

export async function fetchMarketOpenState(supabase: SupabaseClient, userId: string): Promise<MarketOpenState> {
  const { data, error } = await supabase
    .from('users')
    .select('market_open, market_closed_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return { open: data?.market_open ?? true, closedAt: data?.market_closed_at ?? null };
}

// 手動上架／自動上架模式（見 lib/market/restock.ts）。
export async function fetchMarketAutoRestockState(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('market_auto_restock')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.market_auto_restock ?? false;
}
