import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlbumPage, AlbumSlot, CollectionAlbum, LayoutType, Product } from '@/types/database';

export interface AlbumWithPageCount extends CollectionAlbum {
  pageCount: number;
}

export interface SlotWithProduct {
  slot: AlbumSlot;
  product: Pick<Product, 'id' | 'name' | 'category' | 'category_group'> | null;
  photoUrl: string | null;
}

export interface PageWithSlots {
  page: AlbumPage;
  slots: SlotWithProduct[];
}

export interface AlbumDetail {
  album: CollectionAlbum;
  pages: PageWithSlots[];
}

export async function fetchUserAlbums(
  supabase: SupabaseClient,
  userId: string
): Promise<AlbumWithPageCount[]> {
  const { data, error } = await supabase
    .from('collection_albums')
    .select('*, album_pages(count)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const { album_pages, ...album } = row as CollectionAlbum & {
      album_pages: { count: number }[];
    };
    return { ...album, pageCount: album_pages?.[0]?.count ?? 0 };
  });
}

export async function createAlbum(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  albumType: string | null
): Promise<CollectionAlbum> {
  const { data, error } = await supabase
    .from('collection_albums')
    .insert({ user_id: userId, name, album_type: albumType })
    .select('*')
    .single();

  if (error) throw error;
  return data as CollectionAlbum;
}

export async function deleteAlbum(supabase: SupabaseClient, albumId: number): Promise<void> {
  const { error } = await supabase.from('collection_albums').delete().eq('id', albumId);
  if (error) throw error;
}

// 組出收納冊完整內容：每頁 + 每頁格子 + 格子對應的商品資訊（含使用者自己上傳的照片）。
// photoUrl 由呼叫端另外用簽名網址補上（見 app/albums/[id]/page.tsx），這裡先回傳 photo_url 路徑於 product 旁。
async function assembleAlbumDetail(
  supabase: SupabaseClient,
  album: CollectionAlbum
): Promise<AlbumDetail> {
  const { data: pageRows, error: pagesError } = await supabase
    .from('album_pages')
    .select('*')
    .eq('album_id', album.id)
    .order('page_number', { ascending: true });
  if (pagesError) throw pagesError;

  const pages = (pageRows ?? []) as AlbumPage[];
  const pageIds = pages.map((p) => p.id);

  const { data: slotRows, error: slotsError } =
    pageIds.length > 0
      ? await supabase.from('album_slots').select('*').in('page_id', pageIds)
      : { data: [], error: null };
  if (slotsError) throw slotsError;

  const slots = (slotRows ?? []) as AlbumSlot[];
  const collectionIds = [...new Set(slots.map((s) => s.user_collection_id).filter((id): id is number => id != null))];

  const collectionMap = new Map<
    number,
    { product: Pick<Product, 'id' | 'name' | 'category' | 'category_group'>; photo_url: string | null }
  >();

  if (collectionIds.length > 0) {
    const { data: entries, error: entriesError } = await supabase
      .from('user_collections')
      .select('id, photo_url, product:product_id(id, name, category, category_group)')
      .in('id', collectionIds);
    if (entriesError) throw entriesError;

    for (const entry of entries ?? []) {
      const row = entry as unknown as {
        id: number;
        photo_url: string | null;
        product: Pick<Product, 'id' | 'name' | 'category' | 'category_group'> | null;
      };
      if (row.product) {
        collectionMap.set(row.id, { product: row.product, photo_url: row.photo_url });
      }
    }
  }

  const slotsByPage = new Map<number, AlbumSlot[]>();
  for (const slot of slots) {
    const list = slotsByPage.get(slot.page_id) ?? [];
    list.push(slot);
    slotsByPage.set(slot.page_id, list);
  }

  return {
    album,
    pages: pages.map((page) => ({
      page,
      slots: (slotsByPage.get(page.id) ?? [])
        .sort((a, b) => a.slot_index - b.slot_index)
        .map((slot) => {
          const entry = slot.user_collection_id ? collectionMap.get(slot.user_collection_id) : undefined;
          return {
            slot,
            product: entry?.product ?? null,
            photoUrl: entry?.photo_url ?? null,
          };
        }),
    })),
  };
}

export async function fetchAlbumForOwner(
  supabase: SupabaseClient,
  albumId: number,
  userId: string
): Promise<AlbumDetail | null> {
  const { data: album, error } = await supabase
    .from('collection_albums')
    .select('*')
    .eq('id', albumId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!album) return null;

  return assembleAlbumDetail(supabase, album as CollectionAlbum);
}

export async function fetchPublicAlbumByToken(
  supabase: SupabaseClient,
  shareToken: string
): Promise<AlbumDetail | null> {
  const { data: album, error } = await supabase
    .from('collection_albums')
    .select('*')
    .eq('share_token', shareToken)
    .eq('is_public', true)
    .maybeSingle();
  if (error) throw error;
  if (!album) return null;

  return assembleAlbumDetail(supabase, album as CollectionAlbum);
}

export async function createAlbumPage(
  supabase: SupabaseClient,
  albumId: number,
  layoutType: LayoutType
): Promise<AlbumPage> {
  const { data: existing, error: existingError } = await supabase
    .from('album_pages')
    .select('page_number')
    .eq('album_id', albumId)
    .order('page_number', { ascending: false })
    .limit(1);
  if (existingError) throw existingError;

  const nextPageNumber = (existing?.[0]?.page_number ?? 0) + 1;

  const { data, error } = await supabase
    .from('album_pages')
    .insert({ album_id: albumId, page_number: nextPageNumber, layout_type: layoutType })
    .select('*')
    .single();
  if (error) throw error;
  return data as AlbumPage;
}

export async function setAlbumPublic(
  supabase: SupabaseClient,
  albumId: number,
  isPublic: boolean,
  existingShareToken: string | null
): Promise<CollectionAlbum> {
  const shareToken = isPublic ? existingShareToken ?? crypto.randomUUID() : existingShareToken;

  const { data, error } = await supabase
    .from('collection_albums')
    .update({ is_public: isPublic, share_token: shareToken })
    .eq('id', albumId)
    .select('*')
    .single();
  if (error) throw error;
  return data as CollectionAlbum;
}

export interface OwnedCollectionOption {
  userCollectionId: number;
  product: Pick<Product, 'id' | 'name' | 'category' | 'category_group'>;
}

// 選格子用商品清單：僅限已擁有/虛擬收藏（見規格第三節，wanted 狀態不可選入收納冊）
export async function fetchOwnedCollectionOptions(
  supabase: SupabaseClient,
  userId: string
): Promise<OwnedCollectionOption[]> {
  const { data, error } = await supabase
    .from('user_collections')
    .select('id, product:product_id(id, name, category, category_group)')
    .eq('user_id', userId)
    .in('owned_status', ['owned_real', 'owned_virtual']);
  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const r = row as unknown as {
        id: number;
        product: Pick<Product, 'id' | 'name' | 'category' | 'category_group'> | null;
      };
      return r.product ? { userCollectionId: r.id, product: r.product } : null;
    })
    .filter((v): v is OwnedCollectionOption => v !== null);
}

// 同一件商品不可在同一本收納冊中重複選入（規格第三節），需跨頁檢查，資料庫層無法直接用唯一約束表達，
// 故在應用層檢查：先查出這本收納冊所有頁面已使用的 user_collection_id，再比對。
export async function assignSlotProduct(
  supabase: SupabaseClient,
  albumId: number,
  pageId: number,
  slotIndex: number,
  userCollectionId: number
): Promise<{ ok: true } | { ok: false; reason: 'duplicate' }> {
  const { data: pageRows, error: pagesError } = await supabase
    .from('album_pages')
    .select('id')
    .eq('album_id', albumId);
  if (pagesError) throw pagesError;

  const pageIds = (pageRows ?? []).map((p) => p.id as number);

  const { data: existingSlots, error: slotsError } = await supabase
    .from('album_slots')
    .select('page_id, slot_index, user_collection_id')
    .in('page_id', pageIds)
    .eq('user_collection_id', userCollectionId);
  if (slotsError) throw slotsError;

  const alreadyUsedElsewhere = (existingSlots ?? []).some(
    (s) => !(s.page_id === pageId && s.slot_index === slotIndex)
  );
  if (alreadyUsedElsewhere) {
    return { ok: false, reason: 'duplicate' };
  }

  const { error } = await supabase
    .from('album_slots')
    .upsert(
      { page_id: pageId, slot_index: slotIndex, user_collection_id: userCollectionId },
      { onConflict: 'page_id,slot_index' }
    );
  if (error) throw error;
  return { ok: true };
}

export async function clearSlot(supabase: SupabaseClient, pageId: number, slotIndex: number): Promise<void> {
  const { error } = await supabase
    .from('album_slots')
    .delete()
    .eq('page_id', pageId)
    .eq('slot_index', slotIndex);
  if (error) throw error;
}
