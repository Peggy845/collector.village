import type { SupabaseClient } from '@supabase/supabase-js';
import type { Ip, Product, Series } from '@/types/database';

export interface ProductFilters {
  ipId?: number;
  seriesId?: number;
  characters?: string[];
  categoryGroup?: string;
  category?: string;
  kujiPrizeTier?: string;
}

export interface ProductWithRelations extends Product {
  series: Pick<Series, 'id' | 'name'> | null;
  ips: Pick<Ip, 'id' | 'name'> | null;
}

const PAGE_SIZE = 48;

export async function fetchProducts(
  supabase: SupabaseClient,
  filters: ProductFilters,
  page = 1
): Promise<{ products: ProductWithRelations[]; total: number; pageSize: number }> {
  let query = supabase
    .from('products')
    .select('*, series:series_id(id, name), ips:ip_id(id, name)', { count: 'exact' });

  if (filters.ipId) query = query.eq('ip_id', filters.ipId);
  if (filters.seriesId) query = query.eq('series_id', filters.seriesId);
  if (filters.categoryGroup) query = query.eq('category_group', filters.categoryGroup);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.kujiPrizeTier) query = query.eq('kuji_prize_tier', filters.kujiPrizeTier);
  if (filters.characters && filters.characters.length > 0) {
    query = query.overlaps('characters', filters.characters);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query.order('id', { ascending: true }).range(from, to);

  if (error) throw error;

  return {
    products: (data ?? []) as unknown as ProductWithRelations[],
    total: count ?? 0,
    pageSize: PAGE_SIZE,
  };
}

export async function fetchProductById(
  supabase: SupabaseClient,
  id: number
): Promise<ProductWithRelations | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*, series:series_id(id, name), ips:ip_id(id, name)')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as ProductWithRelations | null;
}

export type ProductForProgress = Pick<Product, 'id' | 'series_id' | 'characters'>;

// 收藏進度計算需要完整商品清單當分母（見 lib/utils/collection-progress.ts），只取必要欄位降低傳輸量。
export async function fetchAllProductsForProgress(
  supabase: SupabaseClient
): Promise<ProductForProgress[]> {
  const { data, error } = await supabase.from('products').select('id, series_id, characters');
  if (error) throw error;
  return (data ?? []) as ProductForProgress[];
}

export async function fetchProductsByIds(
  supabase: SupabaseClient,
  ids: number[]
): Promise<ProductWithRelations[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('products')
    .select('*, series:series_id(id, name), ips:ip_id(id, name)')
    .in('id', ids)
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ProductWithRelations[];
}

export async function fetchIps(supabase: SupabaseClient): Promise<Ip[]> {
  const { data, error } = await supabase.from('ips').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Ip[];
}

export async function fetchSeries(supabase: SupabaseClient, ipId?: number): Promise<Series[]> {
  let query = supabase.from('series').select('*').order('name');
  if (ipId) query = query.eq('ip_id', ipId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Series[];
}

export interface FilterFacets {
  categoryGroups: string[];
  categoriesByGroup: Record<string, string[]>;
  kujiPrizeTiers: string[];
  characters: string[];
}

// 分類/角色/賞別選項都是持續擴充中的自由值（見 BUILD_PROMPT.md 3/8 節），
// 不寫死列舉，改成每次從現有商品資料動態算出去重清單。
export async function fetchFilterFacets(supabase: SupabaseClient): Promise<FilterFacets> {
  const { data, error } = await supabase
    .from('products')
    .select('category_group, category, kuji_prize_tier, characters');

  if (error) throw error;

  const categoryGroups = new Set<string>();
  const categoriesByGroup: Record<string, Set<string>> = {};
  const kujiPrizeTiers = new Set<string>();
  const characters = new Set<string>();

  for (const row of data ?? []) {
    if (row.category_group) {
      categoryGroups.add(row.category_group);
      if (row.category) {
        (categoriesByGroup[row.category_group] ??= new Set()).add(row.category);
      }
    }
    if (row.kuji_prize_tier) kujiPrizeTiers.add(row.kuji_prize_tier);
    for (const c of row.characters ?? []) characters.add(c);
  }

  return {
    categoryGroups: [...categoryGroups].sort(),
    categoriesByGroup: Object.fromEntries(
      Object.entries(categoriesByGroup).map(([k, v]) => [k, [...v].sort()])
    ),
    kujiPrizeTiers: [...kujiPrizeTiers].sort(),
    characters: [...characters].sort(),
  };
}
