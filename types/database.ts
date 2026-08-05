export type OwnedStatus = 'owned_real' | 'owned_virtual' | 'wanted';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type LayoutType = '1' | '2h' | '2v' | '3h' | '3v' | '4' | '6' | '8' | '9';
export type MachineKey = 'printer' | 'sewing' | 'press' | 'laser';
export type FormatKey =
  | 'poster'
  | 'postcard'
  | 'card'
  | 'sticker'
  | 'plush'
  | 'plush_outfit'
  | 'badge'
  | 'keychain'
  | 'acrylic_stand'
  | 'acrylic_charm';
export type ProductionBatchStatus = 'in_progress' | 'collected';
export type PlayerDesignStatus = 'library' | 'temp';
export type FurnitureType = 'bookshelf' | 'pegboard' | 'stacking_bin' | 'cashier';
export type Facing = 'up' | 'down';

export interface Ip {
  id: number;
  name: string;
  type: string | null;
}

export interface Series {
  id: number;
  ip_id: number | null;
  name: string | null;
  release_year: number | null;
}

export interface Product {
  id: number;
  ip_id: number | null;
  series_id: number | null;
  name: string;
  characters: string[] | null;
  character_aliases: string[] | null;
  category: string | null;
  category_group: string | null;
  kuji_prize_tier: string | null;
  manufacturer: string | null;
  official_price: string | null;
  image_url: string | null;
  source_url: string | null;
  release_date: string | null;
  tags: string[] | null;
  official_photo_path: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  username: string | null;
  email: string | null;
  social_links: Record<string, string> | null;
  warehouse_capacity: number;
  market_open: boolean;
  market_closed_at: string | null;
  market_auto_restock: boolean;
  design_library_capacity: number;
  created_at: string;
}

export interface UserCollectionEntry {
  id: number;
  user_id: string;
  product_id: number;
  owned_status: OwnedStatus;
  owned_type: string | null;
  photo_url: string | null;
  note: string | null;
  acquired_date: string | null;
  created_at: string;
}

export interface CollectionAlbum {
  id: number;
  user_id: string;
  name: string;
  album_type: string | null;
  is_public: boolean;
  share_token: string | null;
  created_at: string;
}

export interface AlbumPage {
  id: number;
  album_id: number;
  page_number: number;
  layout_type: LayoutType;
  created_at: string;
}

export interface AlbumSlot {
  id: number;
  page_id: number;
  slot_index: number;
  user_collection_id: number | null;
}

export interface ProductSubmission {
  id: number;
  submitted_by: string | null;
  ip_id: number | null;
  series_id: number | null;
  name: string | null;
  characters: string[] | null;
  character_aliases: string[] | null;
  category: string | null;
  category_group: string | null;
  kuji_prize_tier: string | null;
  manufacturer: string | null;
  official_price: string | null;
  image_url: string | null;
  source_url: string | null;
  release_date: string | null;
  tags: string[] | null;
  status: SubmissionStatus;
  created_at: string;
}

export interface ProductPhotoSubmission {
  id: number;
  product_id: number;
  submitted_by: string;
  photo_path: string;
  status: SubmissionStatus;
  reviewed_at: string | null;
  created_at: string;
}

export interface GameCurrencyLedgerEntry {
  id: number;
  user_id: string;
  amount: number;
  reason: string | null;
  created_at: string;
}

export interface FactoryDesign {
  id: number;
  storage_path: string | null;
  name: string | null;
  is_active: boolean;
  user_id: string | null;
  player_design_id: number | null;
  created_at: string;
}

export interface PlayerDesign {
  id: number;
  user_id: string;
  name: string;
  pixel_data: number[];
  is_watermark: boolean;
  status: PlayerDesignStatus;
  current_factory_design_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface FactoryProductionBatch {
  id: number;
  user_id: string;
  machine_key: MachineKey;
  format_key: FormatKey;
  design_id: number;
  quantity: number;
  material_cost: number;
  status: ProductionBatchStatus;
  started_at: string;
  ready_at: string;
  collected_at: string | null;
}

export interface FactoryInventoryItem {
  id: number;
  user_id: string;
  format_key: FormatKey;
  design_id: number;
  quantity: number;
  updated_at: string;
}

export interface MarketFurniture {
  id: number;
  user_id: string;
  furniture_type: FurnitureType;
  capacity: number | null;
  grid_x: number;
  grid_y: number;
  facing: Facing;
  created_at: string;
}

export interface MarketFurnitureSlot {
  id: number;
  furniture_id: number;
  format_key: FormatKey;
  design_id: number;
  quantity: number;
  collected_quantity: number;
  active_from: string;
  listed_at: string;
}
