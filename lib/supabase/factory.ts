import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactoryDesign, FactoryInventoryItem, FactoryProductionBatch } from '@/types/database';

export async function fetchFactoryDesigns(supabase: SupabaseClient): Promise<FactoryDesign[]> {
  const { data, error } = await supabase
    .from('factory_designs')
    .select('*')
    .eq('is_active', true)
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

export function getFactoryDesignUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/factory-designs/${storagePath}`;
}
