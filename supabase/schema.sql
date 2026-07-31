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
  product_code int unique,                   -- 對應 products.csv「商品編號」欄，供人工校對CSV時用編號比對回同一筆資料，
                                              -- 不受日後修正文字內容影響（見 PROJECT_PROGRESS.md「待討論」第1項）
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
  official_photo_path text,                  -- 全站公開顯示的公版代表照 Storage 路徑（見「已定案項目 30」），
                                              -- 與上面 image_url（僅後台使用）明確分開，只有這個欄位對玩家可見
  created_at timestamp default now()
);

-- products 表已於先前版本建立、無 product_code 欄位時，此處補上（重複執行安全跳過）
alter table public.products add column if not exists product_code int;
create unique index if not exists products_product_code_key on public.products(product_code);
alter table public.products add column if not exists official_photo_path text;

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
-- 8. product_photo_submissions（玩家互助補圖，見「已定案項目 30」）
-- =========================================
-- v1 規則：只在該商品 products.official_photo_path 為空時，前端才會開放提交；
-- 一旦有商品已核准公版圖，不再開放其他候選圖取代（避免比較心態，見第12-1項），此規則由應用層把關，
-- 資料庫層不特別限制（審核者仍可依實際情況決定）。
create table if not exists public.product_photo_submissions (
  id serial primary key,
  product_id int references public.products(id) on delete cascade not null,
  submitted_by uuid references public.users(id) on delete cascade not null,
  photo_path text not null,                  -- product-photo-pending bucket 內路徑，格式 submitted_by/product_id/檔名
  status text default 'pending',             -- 'pending' / 'approved' / 'rejected'
  reviewed_at timestamp,
  created_at timestamp default now()
);

-- =========================================
-- 9. game_currency_ledger（遊戲幣帳本，見「已定案項目 10-1」）
-- =========================================
-- 採「帳本」而非「餘額欄位」設計：只累加不修改，加總 amount 即為餘額，
-- 遊戲幣系統本身尚未正式建置前，先用這張表記錄玩家應得的獎勵，避免漏算（見第30項）。
create table if not exists public.game_currency_ledger (
  id serial primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  amount int not null,                       -- 正數為獲得，負數為花費，見「已定案項目 31」工廠系統開始使用花費
  reason text,                               -- 例如 'photo_submission_approved:product_id=123'、'factory_production:batch_id=45'
  created_at timestamp default now()
);

-- =========================================
-- 10. 工廠系統 v1（見「已定案項目 31」）
-- =========================================
-- 機器/原料/格式的完整換算表（成本、產出數量、售價）刻意不建表，寫死在
-- lib/factory/catalog.ts 常數裡即可——這是固定的遊戲規則資料，不需要玩家或管理者透過網頁調整，
-- 建表反而要多一層「怎麼管理這張表的內容」的問題，不符合v1求簡單的原則。

-- factory_designs：v1 由 Peggy 自行到網路上尋找可商用/可修改授權的圖片，用 scripts/add-factory-design.mjs
-- 上傳到 public bucket 並寫入這張表，玩家生產時只能從這裡面選圖，不開放玩家自己上傳（見已定案項目31第3點）。
-- storage_path 允許為 null：正式圖庫還沒準備好之前，先用純文字（name）當佔位設計圖，
-- 前端沒有圖片時改顯示文字色塊，讓工廠功能可以先跑起來，之後 Peggy 找到圖再補上 storage_path。
create table if not exists public.factory_designs (
  id serial primary key,
  storage_path text,                         -- factory-designs bucket 內路徑，null 代表用純文字佔位
  name text,                                  -- 顯示用名稱；storage_path 為 null 時直接顯示這個文字
  is_active boolean not null default true,    -- 之後發現授權問題可下架，不必真的刪除歷史生產紀錄引用的圖
  created_at timestamp default now()
);

alter table public.factory_designs alter column storage_path drop not null;

-- factory_production_batches：一筆代表玩家在某台機器啟動的一次生產。quantity/material_cost 用「下單當下」
-- 從 catalog 抓出來的數字存成快照，避免之後調整經濟數字時，回頭改到玩家已經在生產中的紀錄。
-- 只有兩種狀態：in_progress／collected，「是否已經可以收成」由應用層比較 ready_at 與現在時間判斷，
-- 不需要額外的第三種狀態。
create table if not exists public.factory_production_batches (
  id serial primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  machine_key text not null,                 -- printer / sewing / press / laser
  format_key text not null,                  -- poster / postcard / card / sticker / plush / plush_outfit / badge / keychain / acrylic_stand / acrylic_charm
  design_id int references public.factory_designs(id) not null,
  quantity int not null,
  material_cost int not null,
  status text not null default 'in_progress', -- 'in_progress' / 'collected'
  -- 這三欄用 timestamptz（不是專案裡其他表常用的 timestamp）：ready_at 需要拿來跟應用層算出來的
  -- 絕對時間（Date.now() + 生產分鐘數）比較是否可以收成，若用不含時區的 timestamp，
  -- 資料庫連線階段的時區設定會讓存進去的值悄悄位移，導致「還沒到時間就顯示可以收成」。
  started_at timestamptz default now(),
  ready_at timestamptz not null,
  collected_at timestamptz
);

-- factory_production_batches 若在此修正之前就已建立過（欄位當時是 timestamp 不含時區），
-- 這裡補一次型別修正，重複執行安全（欄位已經是 timestamptz 時這幾行是無害的 no-op）。
alter table public.factory_production_batches alter column started_at type timestamptz using started_at::timestamptz;
alter table public.factory_production_batches alter column ready_at type timestamptz using ready_at::timestamptz;
alter table public.factory_production_batches alter column collected_at type timestamptz using collected_at::timestamptz;

-- 同一台機器同一時間只能有一批生產中（見已定案項目31：四台不同機器可以同時生產，但同一台不行）。
-- 用資料庫層的 partial unique index 而不是應用層先查再寫，是因為「先查有沒有生產中→沒有就寫入」
-- 這兩步中間有空隙，兩個幾乎同時送出的請求都可能查到「沒有」而各自寫入一筆，造成同一台機器
-- 有兩批生產中；partial unique index 由資料庫保證原子性，不會有這個問題。
create unique index if not exists factory_production_batches_one_active_per_machine
  on public.factory_production_batches (user_id, machine_key)
  where status = 'in_progress';

-- factory_inventory_items：收成後的成品堆疊在這裡，依「格式+設計圖」歸類，賣出時扣減數量，
-- 數量歸零直接留著（quantity=0）或刪除都可以，應用層一律用 upsert 處理，不特別清理。
create table if not exists public.factory_inventory_items (
  id serial primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  format_key text not null,
  design_id int references public.factory_designs(id) not null,
  quantity int not null default 0,
  updated_at timestamp default now(),
  unique (user_id, format_key, design_id)
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
alter table public.product_photo_submissions enable row level security;
alter table public.game_currency_ledger enable row level security;

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

-- product_photo_submissions：使用者可新增、查看、撤回自己「待審核」的提交；審核（approved/rejected）僅限 service role 腳本
drop policy if exists "own photo submissions select" on public.product_photo_submissions;
create policy "own photo submissions select" on public.product_photo_submissions
  for select using (auth.uid() = submitted_by);

drop policy if exists "own photo submissions insert" on public.product_photo_submissions;
create policy "own photo submissions insert" on public.product_photo_submissions
  for insert with check (auth.uid() = submitted_by);

drop policy if exists "own photo submissions delete pending" on public.product_photo_submissions;
create policy "own photo submissions delete pending" on public.product_photo_submissions
  for delete using (auth.uid() = submitted_by and status = 'pending');

-- game_currency_ledger：使用者只能查看自己的帳本紀錄，寫入僅限 service role（審核腳本發放獎勵／工廠API扣款加款）
drop policy if exists "own ledger select" on public.game_currency_ledger;
create policy "own ledger select" on public.game_currency_ledger for select using (auth.uid() = user_id);

-- factory_designs：全站玩家皆可讀（挑圖用），寫入僅限 service role（add-factory-design.mjs 腳本）
alter table public.factory_designs enable row level security;
drop policy if exists "factory designs readable by everyone" on public.factory_designs;
create policy "factory designs readable by everyone" on public.factory_designs for select using (is_active);

-- factory_production_batches / factory_inventory_items：使用者只能查看自己的紀錄，
-- 寫入（開始生產／收成／賣出）一律透過 app/api/factory/* 路由用 service role 執行，
-- 不開放一般角色直接 insert/update，避免玩家繞過 API 直接竄改遊戲幣或生產數量。
alter table public.factory_production_batches enable row level security;
drop policy if exists "own production batches select" on public.factory_production_batches;
create policy "own production batches select" on public.factory_production_batches
  for select using (auth.uid() = user_id);

alter table public.factory_inventory_items enable row level security;
drop policy if exists "own inventory select" on public.factory_inventory_items;
create policy "own inventory select" on public.factory_inventory_items
  for select using (auth.uid() = user_id);

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

-- =========================================
-- Storage：product-photo-pending / product-photos bucket（玩家互助補圖，見「已定案項目 30」）
-- =========================================
-- product-photo-pending：private，玩家提交的候選圖審核前只有本人與 service role（審核腳本）看得到，
-- 路徑規則 submitted_by/product_id/檔名，比照 collection-photos 的路徑慣例
-- product-photos：public，審核通過後的正式公版代表照，全站玩家皆可讀，只有 service role（審核腳本）能寫入

insert into storage.buckets (id, name, public)
values ('product-photo-pending', 'product-photo-pending', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

drop policy if exists "own pending photo submissions select" on storage.objects;
create policy "own pending photo submissions select" on storage.objects for select
  using (bucket_id = 'product-photo-pending' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own pending photo submissions insert" on storage.objects;
create policy "own pending photo submissions insert" on storage.objects for insert
  with check (bucket_id = 'product-photo-pending' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own pending photo submissions delete" on storage.objects;
create policy "own pending photo submissions delete" on storage.objects for delete
  using (bucket_id = 'product-photo-pending' and (storage.foldername(name))[1] = auth.uid()::text);

-- product-photos 是 public bucket，讀取不需要政策（Supabase 對 public bucket 預設開放 select）；
-- 寫入只由 service role 執行的審核腳本進行，一般角色不需要、也沒有 insert/update policy

-- =========================================
-- Storage：factory-designs bucket（工廠系統 v1，見「已定案項目 31」）
-- =========================================
-- public bucket，玩家生產時選圖需要能直接讀取縮圖；寫入只由 scripts/add-factory-design.mjs
-- （service role）執行，一般角色不需要、也沒有 insert/update policy，比照 product-photos 的做法。

insert into storage.buckets (id, name, public)
values ('factory-designs', 'factory-designs', true)
on conflict (id) do nothing;
