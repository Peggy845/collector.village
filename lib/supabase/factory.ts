import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactoryDesign, FactoryInventoryItem, FactoryProductionBatch } from '@/types/database';

// 管理員全站圖庫（user_id為null）＋自己在設計坊畫的（user_id等於自己）都要看得到，
// 但不能看到別人自畫的設計（見 supabase/schema.sql 第12節 RLS 說明）。
export async function fetchFactoryDesigns(supabase: SupabaseClient, userId: string): Promise<FactoryDesign[]> {
  const { data, error } = await supabase
    .from('factory_designs')
    .select('*')
    .eq('is_active', true)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as FactoryDesign[];
}

export async function fetchActiveProductionBatches(
  supabase: SupabaseClient,
  userId: string
): Promise<FactoryProductionBatch[]> {
  const { data, error } = await supabase
    .from('factory_production_batches')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress');
  if (error) throw error;
  return (data ?? []) as FactoryProductionBatch[];
}

export async function fetchInventory(
  supabase: SupabaseClient,
  userId: string
): Promise<FactoryInventoryItem[]> {
  const { data, error } = await supabase
    .from('factory_inventory_items')
    .select('*')
    .eq('user_id', userId)
    .gt('quantity', 0);
  if (error) throw error;
  return (data ?? []) as FactoryInventoryItem[];
}

// 管理員圖庫的圖存在 factory-designs bucket；玩家自畫的設計圖存在另一個 player-designs bucket
// （見 lib/supabase/design-studio.ts、supabase/schema.sql 第12節），呼叫端依 design.user_id
// 是否有值決定要組哪個 bucket 的網址（見 components/factory/DesignThumb.tsx）。
export function getFactoryDesignUrl(storagePath: string, bucket: 'factory-designs' | 'player-designs' = 'factory-designs'): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
}
