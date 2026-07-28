# 給 Claude Code 的開發指令：我的收納冊（Collection Albums）功能

## 專案背景（供快速上下文，非新指令）
Collector.Village 是一個 Next.js（App Router）+ Supabase 的《進擊的巨人》周邊收藏管理網站，已上線功能包含會員系統、`/browse` 收藏庫瀏覽（篩選）、商品詳情頁（標記已擁有/虛擬收藏/想要、備註、照片上傳）、`/dashboard` 我的收藏紀錄、`/wishlist` 想要清單、`/town` 小鎮總覽、`/settings` 個人設定。這次要新增一個獨立的新功能：**我的收納冊**。

## 功能目標
讓使用者把自己「已擁有」的商品，用類似實體小卡收納冊的方式整理、瀏覽。每本收納冊可以有多頁，每頁套用固定格數的版面模板，使用者把商品拖曳/選入格子。每本收納冊可以設定公開或私人，公開時產生一組唯讀分享連結。

**這不是取代 `/browse`**，是新增、平行的功能。

## 一、資料庫變更

在 `supabase/schema.sql` 新增以下三張表（緊接在既有 `user_collections` 表之後）：

```sql
CREATE TABLE collection_albums (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) NOT NULL,
  name TEXT NOT NULL,
  album_type TEXT,
  is_public BOOLEAN DEFAULT false,
  share_token TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE album_pages (
  id SERIAL PRIMARY KEY,
  album_id INT REFERENCES collection_albums(id) ON DELETE CASCADE NOT NULL,
  page_number INT NOT NULL,
  layout_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE album_slots (
  id SERIAL PRIMARY KEY,
  page_id INT REFERENCES album_pages(id) ON DELETE CASCADE NOT NULL,
  slot_index INT NOT NULL,
  user_collection_id INT REFERENCES user_collections(id),
  UNIQUE(page_id, slot_index)
);
```

並比照專案既有的 Row Level Security 慣例（`user_collections` 等表的既有政策）新增政策：
- `collection_albums`：`SELECT` 允許 `user_id = auth.uid()` **或** `is_public = true`；`INSERT`/`UPDATE`/`DELETE` 僅限 `user_id = auth.uid()`。
- `album_pages`、`album_slots`：透過關聯到 `album_id`／`page_id` 往上查 `collection_albums` 的擁有者與公開狀態，套用相同判斷邏輯（擁有者可全權操作，公開時任何人可讀取）。

`share_token` 於使用者將收納冊設為公開時，由後端產生一組隨機字串（例如 UUID 或等效長度的隨機亂碼），設回私人時可保留或清空皆可（保留較省事，重新公開沿用同一個連結）。

## 二、版面模板（前端固定常數，不需存資料庫結構，只需存 `layout_type` 字串）

定義一個前端常數對照表，key 對應 `layout_type` 欄位值：

| layout_type | 格數 | 排列 |
|---|---|---|
| `1` | 1格 | 1×1 |
| `2h` | 2格 | 1×2（橫向） |
| `2v` | 2格 | 2×1（直向） |
| `3h` | 3格 | 1×3（橫向） |
| `3v` | 3格 | 3×1（直向） |
| `4` | 4格 | 2×2（固定，無方向選項） |
| `6` | 6格 | 2×3（固定，無方向選項） |
| `8` | 8格 | 2×4（固定，無方向選項） |
| `9` | 9格 | 3×3（固定，無方向選項） |

新增頁面時，使用者從上述 9 個選項中擇一，不提供自訂行列數的排版功能。

## 三、頁面與路由

### `/albums`（會員專屬，需登入）
- 列出使用者自己所有的收納冊，卡片顯示：名稱、`album_type`、公開/私人狀態標籤、頁數。
- 「新增收納冊」按鈕：輸入名稱、選填 `album_type`，建立後導向該收納冊的編輯頁。

### `/albums/[id]`（會員專屬，需登入，且需驗證 `user_id` 為本人）
- 左右翻頁瀏覽（比照使用者 wireframe 構想的左/右箭頭切換頁面）。
- 每頁依 `layout_type` 顯示對應格數的網格，格子可點擊開啟「選擇商品」面板。
- 「選擇商品」面板：重用 `/browse` 既有的商品清單/篩選元件，但**篩選條件強制限制為 `owned_status IN ('owned_real', 'owned_virtual')`**（`wanted` 狀態商品不可選）。同一件商品不可在同一本收納冊中重複選入，但可以出現在使用者的其他收納冊裡。
- 「新增頁面」按鈕：跳出版面模板選擇（見上方九選一清單），建立新的 `album_pages` 列。
- 頁面內有「公開／私人」開關；切至公開時呼叫後端 API 產生（或沿用既有）`share_token`，並顯示可複製的分享連結。

### `/albums/share/[token]`（公開路由，**不需登入**）
- 依 `share_token` 查詢對應的公開收納冊（`is_public = true` 才可查到，否則回傳 404，不透露「私人收納冊存在」這件事）。
- 唯讀檢視：可翻頁瀏覽格子內容，但**只顯示商品圖片與商品名稱**，不顯示備註、入手日期、`owned_status`（實體/虛擬）等個人資訊。
- 不提供任何編輯功能，不顯示「新增頁面」等操作按鈕。
- 頁面設為 `noindex`（比照既有商品詳情頁的 SEO 策略），避免被搜尋引擎索引。

## 四、明確排除項目（重要，請勿自行擴充）

- **不做**「瀏覽所有使用者公開收納冊」的探索/廣場頁面，公開收納冊只能透過持有連結的人直接存取，不提供任何清單/搜尋介面。
- **不做**小屋空間視覺化（保險箱/書櫃）的訪問系統。
- **不做**自由拖拉調整格數/行列數的排版功能，僅套用上方九種固定模板。
- **不做**好友系統、追蹤其他使用者、留言/互動功能。

## 五、建議開發順序

1. `supabase/schema.sql` 新增三張表 + RLS 政策，本機重新執行確認可重複執行不報錯。
2. `/albums` 清單頁 + 新增收納冊功能。
3. `/albums/[id]` 內容編輯：新增頁面（模板選擇）、選入商品、移除商品、翻頁。
4. 公開/私人開關 + `share_token` 產生邏輯。
5. `/albums/share/[token]` 公開唯讀頁。
6. 手動驗證流程（比照既有功能：`npm run build`、`npx tsc --noEmit`、`npm run lint`、逐路由測試、確認未登入時受保護頁面正確導向 `/login`，公開分享頁未登入也能正常瀏覽）。

## 六、待確認/待決定的細節（可留給 Claude Code 依專案既有慣例自行判斷）
- `album_type` 是否要限制為固定選項清單（如小卡收納櫃/徽章收納簿/海報收納夾）或純自由文字欄位——目前未特別限制，可先做自由文字欄位，之後有需要再改成下拉選單。
- 收納冊封面圖示：MVP 階段可用格子內第一件商品的照片或預設圖示代替，不需要另外設計封面上傳功能。
