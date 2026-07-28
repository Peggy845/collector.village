-- Collector.Village 資料庫 Schema
-- 使用方式：登入 supabase.com，進入你的專案 > SQL Editor > New query，
-- 貼上整份檔案內容並執行（Run）。可重複執行，已存在的物件會被安全跳過。
--
-- 與 BUILD_PROMPT.md 第3節的差異說明：
-- 原規格書的 users 表設計於「尚未決定採用 Supabase Auth」的規劃早期階段，
-- 使用 SERIAL id + password_hash 欄位。但專案已定案改用 Supabase Auth（見第7.1節），
-- Supabase Auth 會在內建的 auth.users 表安全地管理密碼雜湊，應用層不應該、
-- 也不需要自己再存一份 password_hash（重複儲存等於多一個未受管理的密碼副本，是安全反模式）。
-- 因此這裡的 public.users 改為：
--   1. id 改用 UUID，並以外鍵對應 auth.users(id)，讓 auth.uid() 可以直接跟 RLS 規則比對
--   2. 移除 password_hash 欄位
--   3. 新增一個 trigger：使用者在 Supabase Auth 完成註冊時，自動在 public.users 建立對應列
-- 其餘欄位（username/email/social_links/created_at）與規格書一致。

-- =========================================
-- 1. ips
-- =========================================
create table if not exists public.ips (
  id serial primary key,
  name text not null,
  type text
);

-- =========================================
-- 2. series
-- =========================================
create table if not exists public.series (
  id serial primary key,
  ip_id int references public.ips(id),
  name text,
  release_year int
);

-- =========================================
-- 3. products
-- =========================================
create table if not exists public.products (
  id serial primary key,
  ip_id int references public.ips(id),
  series_id int references public.series(id),
  name text not null,                        -- 商品名稱（不含系列名）
  characters text[],                         -- 主要角色標籤，用於篩選UI
  character_aliases text[],                  -- 角色別名/暱稱，輔助搜尋，不進篩選清單
  category text,                             -- 細分類
  category_group text,                       -- 大分類
  kuji_prize_tier text,                      -- 賞別，非一番賞商品留空
  manufacturer text,
  official_price text,                       -- 顯示字串，如 '¥780'、'NT$250'、'非賣品'
  image_url text,                            -- 僅供後台管理者使用，不對玩家顯示
  source_url text,                           -- 僅供後台管理者使用，不對玩家顯示
  release_date date,
  tags text[],
  created_at timestamp default now()
);

-- =========================================
-- 4. users（對應 Supabase Auth 使用者的公開資料）
-- =========================================
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,                      -- 顯示暱稱，不用於登入
  email text unique,
  social_links jsonb,                        -- 選填，FB/IG/Threads等純連結
  created_at timestamp default now()
);

-- 新使用者於 Supabase Auth 完成註冊時，自動建立對應的 public.users 列
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================
-- 5. user_collections
-- =========================================
create table if not exists public.user_collections (
  id serial primary key,
  user_id uuid references public.users(id) on delete cascade,
  product_id int references public.products(id) on delete cascade,
  owned_status text default 'owned_real',    -- 'owned_real' / 'owned_virtual' / 'wanted'
  owned_type text,
  photo_url text,                            -- 單張正面照
  note text,                                 -- 泛用備註
  acquired_date date,
  created_at timestamp default now(),
  unique(user_id, product_id, owned_type)
);

-- =========================================
-- 6. collection_albums / album_pages / album_slots（我的收納冊功能）
-- =========================================
-- 注意：claude-code-instructions-albums.md 原始規格寫 collection_albums.user_id 為 INT，
-- 但實際 public.users.id 是 uuid（見上方第4節說明），這裡依實際 schema 修正為 uuid。

create table if not exists public.collection_albums (
  id serial primary key,
  user_id uuid references public.users(id) on delete cascade,
  name text not null,
  album_type text,                           -- 自由文字欄位，例如「小卡收納簿」「徽章收納冊」，不限制選項
  is_public boolean default false,
  share_token text unique,                   -- 設為公開時產生，供 /albums/share/[token] 使用
  created_at timestamp default now()
);

create table if not exists public.album_pages (
  id serial primary key,
  album_id int references public.collection_albums(id) on delete cascade not null,
  page_number int not null,
  layout_type text not null,                 -- '1'/'2h'/'2v'/'3h'/'3v'/'4'/'6'/'8'/'9'，對應前端固定版面模板
  created_at timestamp default now(),
  unique(album_id, page_number)
);

create table if not exists public.album_slots (
  id serial primary key,
  page_id int references public.album_pages(id) on delete cascade not null,
  slot_index int not null,
  user_collection_id int references public.user_collections(id) on delete set null,
  unique(page_id, slot_index)
);

-- =========================================
-- 7. product_submissions
-- =========================================
create table if not exists public.product_submissions (
  id serial primary key,
  submitted_by uuid references public.users(id) on delete cascade,
  ip_id int,
  series_id int,
  name text,
  characters text[],
  character_aliases text[],
  category text,
  category_group text,
  kuji_prize_tier text,
  manufacturer text,
  official_price text,
  image_url text,
  source_url text,
  release_date date,
  tags text[],
  status text default 'pending',             -- 'pending' / 'approved' / 'rejected'
  created_at timestamp default now()
);

-- =========================================
-- Row Level Security
-- =========================================

alter table public.ips enable row level security;
alter table public.series enable row level security;
alter table public.products enable row level security;
alter table public.users enable row level security;
alter table public.user_collections enable row level security;
alter table public.collection_albums enable row level security;
alter table public.album_pages enable row level security;
alter table public.album_slots enable row level security;
alter table public.product_submissions enable row level security;

-- ips / series / products：所有人（含未登入訪客）可讀，寫入僅限 service role（此處不建任何 insert/update/delete policy，
-- 一般角色因此無法寫入；service role 預設會繞過 RLS，供 scripts/ 內的匯入腳本使用）
drop policy if exists "ips readable by everyone" on public.ips;
create policy "ips readable by everyone" on public.ips for select using (true);

drop policy if exists "series readable by everyone" on public.series;
create policy "series readable by everyone" on public.series for select using (true);

drop policy if exists "products readable by everyone" on public.products;
create policy "products readable by everyone" on public.products for select using (true);

-- users：只能讀寫自己的列
drop policy if exists "users can view own row" on public.users;
create policy "users can view own row" on public.users for select using (auth.uid() = id);

drop policy if exists "users can update own row" on public.users;
create policy "users can update own row" on public.users for update using (auth.uid() = id);

-- user_collections：使用者只能讀寫自己 user_id 的資料列，完全私人，無例外
drop policy if exists "own collections select" on public.user_collections;
create policy "own collections select" on public.user_collections for select using (auth.uid() = user_id);

drop policy if exists "own collections insert" on public.user_collections;
create policy "own collections insert" on public.user_collections for insert with check (auth.uid() = user_id);

drop policy if exists "own collections update" on public.user_collections;
create policy "own collections update" on public.user_collections for update using (auth.uid() = user_id);

drop policy if exists "own collections delete" on public.user_collections;
create policy "own collections delete" on public.user_collections for delete using (auth.uid() = user_id);

-- collection_albums：本人可完全操作；公開（is_public）時任何人（含未登入訪客）可讀，不透露私人收納冊的存在
drop policy if exists "albums select own or public" on public.collection_albums;
create policy "albums select own or public" on public.collection_albums
  for select using (auth.uid() = user_id or is_public = true);

drop policy if exists "albums insert own" on public.collection_albums;
create policy "albums insert own" on public.collection_albums
  for insert with check (auth.uid() = user_id);

drop policy if exists "albums update own" on public.collection_albums;
create policy "albums update own" on public.collection_albums
  for update using (auth.uid() = user_id);

drop policy if exists "albums delete own" on public.collection_albums;
create policy "albums delete own" on public.collection_albums
  for delete using (auth.uid() = user_id);

-- album_pages：透過 album_id 往上查 collection_albums 的擁有者/公開狀態，套用相同判斷邏輯
drop policy if exists "album pages select own or public" on public.album_pages;
create policy "album pages select own or public" on public.album_pages
  for select using (
    exists (
      select 1 from public.collection_albums a
      where a.id = album_pages.album_id and (a.user_id = auth.uid() or a.is_public = true)
    )
  );

drop policy if exists "album pages insert own" on public.album_pages;
create policy "album pages insert own" on public.album_pages
  for insert with check (
    exists (
      select 1 from public.collection_albums a
      where a.id = album_pages.album_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "album pages update own" on public.album_pages;
create policy "album pages update own" on public.album_pages
  for update using (
    exists (
      select 1 from public.collection_albums a
      where a.id = album_pages.album_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "album pages delete own" on public.album_pages;
create policy "album pages delete own" on public.album_pages
  for delete using (
    exists (
      select 1 from public.collection_albums a
      where a.id = album_pages.album_id and a.user_id = auth.uid()
    )
  );

-- album_slots：透過 page_id -> album_id 往上查，套用相同判斷邏輯
drop policy if exists "album slots select own or public" on public.album_slots;
create policy "album slots select own or public" on public.album_slots
  for select using (
    exists (
      select 1 from public.album_pages p
      join public.collection_albums a on a.id = p.album_id
      where p.id = album_slots.page_id and (a.user_id = auth.uid() or a.is_public = true)
    )
  );

drop policy if exists "album slots insert own" on public.album_slots;
create policy "album slots insert own" on public.album_slots
  for insert with check (
    exists (
      select 1 from public.album_pages p
      join public.collection_albums a on a.id = p.album_id
      where p.id = album_slots.page_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "album slots update own" on public.album_slots;
create policy "album slots update own" on public.album_slots
  for update using (
    exists (
      select 1 from public.album_pages p
      join public.collection_albums a on a.id = p.album_id
      where p.id = album_slots.page_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "album slots delete own" on public.album_slots;
create policy "album slots delete own" on public.album_slots
  for delete using (
    exists (
      select 1 from public.album_pages p
      join public.collection_albums a on a.id = p.album_id
      where p.id = album_slots.page_id and a.user_id = auth.uid()
    )
  );

-- product_submissions：使用者只能新增與查看自己提交的紀錄；審核（更新 status）僅限 service role
drop policy if exists "own submissions select" on public.product_submissions;
create policy "own submissions select" on public.product_submissions for select using (auth.uid() = submitted_by);

drop policy if exists "own submissions insert" on public.product_submissions;
create policy "own submissions insert" on public.product_submissions for insert with check (auth.uid() = submitted_by);

-- =========================================
-- Storage：collection-photos bucket
-- =========================================
-- Bucket 本身建議在 Dashboard 手動建立（Storage > New bucket）：
--   名稱：collection-photos，Public bucket：關閉（private）
-- 建立後，下方政策讓使用者只能存取路徑第一層等於自己 user_id 的檔案，
-- 對應路徑規則 user_id/product_id/檔名（見 BUILD_PROMPT.md 第7.2節）

insert into storage.buckets (id, name, public)
values ('collection-photos', 'collection-photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos select" on storage.objects;
create policy "own photos select" on storage.objects for select
  using (bucket_id = 'collection-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own photos insert" on storage.objects;
create policy "own photos insert" on storage.objects for insert
  with check (bucket_id = 'collection-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own photos update" on storage.objects;
create policy "own photos update" on storage.objects for update
  using (bucket_id = 'collection-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own photos delete" on storage.objects;
create policy "own photos delete" on storage.objects for delete
  using (bucket_id = 'collection-photos' and (storage.foldername(name))[1] = auth.uid()::text);
