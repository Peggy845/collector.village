# Collector.Village — Claude Code 建置提示文件

> 這份文件是給 Claude Code 執行建置用的規格書，彙整自「collector-village-progress」規劃文件的所有定案內容。
> 用法：MVP 資料齊全後，把這份文件連同正式商品 CSV 一起貼給 Claude Code，作為初始化 prompt。

---

## 1. 專案總覽

**專案名稱**：Collector.Village
**核心概念**：動漫周邊收藏管理網站，玩家勾選自己擁有的商品、追蹤收藏狀態。第一階段以《進擊的巨人》為主軸，資料庫設計需保留未來擴充其他 IP 的彈性。
**開發者背景**：一人開發，無前端/後端實務經驗，全部程式交由 Claude Code 生成，本文件即完整規格輸入。

---

## 2. 技術棧

- **前端框架**：Next.js（App Router）
- **資料庫 + 認證 + 儲存**：Supabase（PostgreSQL + Supabase Auth + Supabase Storage），先用免費方案
- **部署**：Vercel 免費方案
- **不使用**任何遊戲引擎；本專案是純 Web 應用

---

## 3. 資料庫 Schema（可直接建表）

```sql
CREATE TABLE ips (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT
);

CREATE TABLE series (
  id SERIAL PRIMARY KEY,
  ip_id INT REFERENCES ips(id),
  name TEXT,
  release_year INT
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  ip_id INT REFERENCES ips(id),
  series_id INT REFERENCES series(id),
  name TEXT NOT NULL,                        -- 商品名稱（不含系列名）
  characters TEXT[],                         -- 主要角色標籤，畫面上出現的每個角色都列出，用於篩選UI
  character_aliases TEXT[],                  -- 角色別名/暱稱（如 團長漢吉），輔助搜尋，不進篩選清單
  category TEXT,                             -- 細分類
  category_group TEXT,                       -- 大分類，允許值：立體公仔類、配戴隨身類、包袋類、服裝類、生活雜貨類、紙製/影像類、影音類、出版品類、布娃娃類（持續擴充中）
  kuji_prize_tier TEXT,                      -- 賞別，非一番賞商品留空
  manufacturer TEXT,
  official_price TEXT,                       -- 顯示字串，如 '¥780'、'NT$250'、'非賣品'
  image_url TEXT,                            -- 僅供後台管理者使用，不對玩家顯示
  source_url TEXT,                           -- 僅供後台管理者使用，不對玩家顯示
  release_date DATE,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE,                      -- 顯示暱稱，不用於登入
  email TEXT UNIQUE,
  password_hash TEXT,
  social_links JSONB,                        -- 選填，FB/IG/Threads等純連結，不涉及OAuth
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE user_collections (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  product_id INT REFERENCES products(id),
  owned_status TEXT DEFAULT 'owned_real',    -- 'owned_real' / 'owned_virtual' / 'wanted'
  owned_type TEXT,
  photo_url TEXT,                            -- 單張正面照，MVP不做多張
  note TEXT,                                 -- 泛用備註，玩家自由填寫
  acquired_date DATE,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id, product_id, owned_type)
);

CREATE TABLE product_submissions (
  id SERIAL PRIMARY KEY,
  submitted_by INT REFERENCES users(id),
  -- 以下欄位與 products 相同結構
  ip_id INT, series_id INT, name TEXT, characters TEXT[], character_aliases TEXT[],
  category TEXT, category_group TEXT, kuji_prize_tier TEXT, manufacturer TEXT,
  official_price TEXT, image_url TEXT, source_url TEXT, release_date DATE, tags TEXT[],
  status TEXT DEFAULT 'pending',             -- 'pending' / 'approved' / 'rejected'
  created_at TIMESTAMP DEFAULT now()
);
```

**Row Level Security（RLS）要求**：
- `user_collections`：使用者只能讀寫自己 `user_id` 的資料列，完全私人，無例外。
- `product_submissions`：使用者只能新增與查看自己提交的紀錄；審核（更新 status）僅限開發者本人（用 Supabase service role 執行，不對一般使用者開放）。
- `products`、`series`、`ips`：所有人（含未登入訪客）可讀，僅開發者本人可寫（透過 service role 腳本）。

---

## 4. 頁面結構與路由

6 個頁面，分兩區，中間以登入/註冊銜接：

**公開瀏覽區（不需登入）：**
- `/`（首頁）：專案簡介、精選商品、註冊/登入入口
- `/browse`（收藏庫瀏覽頁）：核心頁面，篩選條件：作品(IP)、系列/活動、角色（複選）、大分類→細分類、賞別。登入後每張商品卡片顯示個人擁有狀態標記
- `/products/[id]`（商品詳情頁）：單一商品完整資訊，登入後可切換三種狀態、上傳照片、寫備註、填入手日期。**設為 noindex**（見第11節SEO）

**會員專屬區（需登入）：**
- `/town`（小鎮總覽，登入後首頁）：主題化導覽 hub。分兩類建築區塊：
  - **已開放建築**（連結至既有頁面，無新開發邏輯）：圖書館 → `/dashboard`；家 → `/browse`+`/wishlist`
  - **未來擴充建築**（僅視覺呈現，UI需明確標示「尚未開放」，不需連結、不需底層邏輯）：工廠、超市、市集、服飾店。這些是純視覺佔位，不要主動實作對應功能（見第12節排除清單）
- `/dashboard`（我的收藏總覽，介面文字用「收藏紀錄」而非「進度」）：整體收藏統計，依系列（封閉集合，用百分比）與依角色（開放集合，用原始數字）分別統計
- `/wishlist`（想要清單）：即 `/browse` 篩選 `owned_status='wanted'` 的視圖，共用同一套元件
- `/settings`（個人設定）：帳號管理、社群連結選填、刪除帳號功能（二次確認）

**未登入導向規則**：使用者在 `/products/[id]` 想標記狀態但未登入時，導向登入/註冊頁，完成後應返回原本瀏覽的商品頁（用 redirect 參數實作），不可讓使用者需要重新搜尋一次。

**美術風格指引（重要）**：MVP 階段採**純平面、簡潔圖示風格**，不做 3D/2.5D/等角視角等複雜視覺效果。「小鎮」「圖書館」「家」等主題僅透過文字標籤、簡單圖示、色彩區塊呈現即可，不需要也不應該嘗試生成寫實或複雜的建築插畫（Claude Code 不具備生成此類美術素材的能力，勉強生成的 CSS/SVG 建築圖案品質可能不佳）。若開發者後續提供美術素材（圖片檔案），再行整合替換。

---

## 5. 核心商業邏輯

### 5.1 收藏進度計算（重要，必須嚴格遵守）

**不可違反的核心原則：依集合性質分兩種呈現方式，禁止混用。**

- **封閉集合**（單一 `series_id`，分母固定不變）→ 用百分比呈現，如「7/10 = 70%」
- **開放集合**（單一角色、全站總量，分母持續擴充中）→ **禁止用百分比**，只能用原始數字呈現，如「已收藏 312 件（資料庫目前收錄約 2000 件相關商品，持續擴充中）」

原因：開放集合分母浮動時，百分比會製造「進度倒退」的錯覺（其他人補充資料後分母變大，你的百分比不合理地下降），對玩家是失真且誤導的呈現。

**統計範圍三層**：全站總進度（開放集合）、依系列統計（封閉集合）、依角色統計（開放集合）。

**多角色商品**：一件商品的 `characters` 陣列若含多個角色，該商品完整計入每個角色各自的分母，擁有時各自分子 +1，不拆分比例。

**`wanted` 狀態**：只計入分母，不計入任何分子。

**實體 vs 虛擬**：`owned_virtual` 不計入核心「實體收藏進度」的分子，虛擬收藏數字需另外/次要顯示，不可合併成同一個數字。

### 5.2 反焦慮設計原則（禁止事項，不可實作以下功能）

1. 絕不做「集滿即可兌換/解鎖」機制
2. 不主動推播「只差一件就完成」之類的催促提醒
3. 不做進度排行榜或玩家間的收藏數比較功能
4. 我的收藏總覽頁用詞一律用「收藏紀錄」，不用「進度」等強調競賽感的詞

---

## 6. UI 文字規範

**狀態標籤：**
| 資料庫值 | 顯示文字 |
|---|---|
| `owned_real` | 已擁有（綠色系） |
| `owned_virtual` | 虛擬收藏（紫色系，需與「已擁有」明顯區隔） |
| `wanted` | 想要（灰色/外框樣式） |

**主要按鈕**：標記為已擁有 / 加入想要清單 / 標記為虛擬收藏 / 編輯備註 / 上傳照片 / 移除標記 / 篩選 / 清除篩選

**篩選面板標籤**：作品 / 系列活動 / 角色 / 分類（大→細兩層）/ 賞別

---

## 7. 功能模組規格

### 7.1 使用者註冊/登入
- 僅 Email + 密碼（Supabase Auth），**不做 OAuth 第三方登入**
- 登入只認 email，`username` 純顯示用
- 開啟 Supabase 預設 Email 驗證信
- 忘記密碼用 Supabase 內建重設機制
- 註冊時需勾選同意服務條款與隱私權政策（文字內容另外提供，此處僅需有勾選欄位與連結）
- **最低使用年齡 13 歲**，服務條款加註「未滿18歲需法定代理人同意」

### 7.2 照片上傳
- Supabase Storage bucket：`collection-photos`，路徑結構 `user_id/product_id/檔名`
- 接受 jpg/png/webp，單檔上限 5MB，**前端上傳前需壓縮至長邊 1600px 內**
- 一件收藏僅一張正面照（不做多張）
- bucket 設為 private，前端用簽名網址（signed URL）存取

### 7.3 CSV 批次匯入（本機腳本，非網頁後台）
- 放在 `scripts/` 資料夾的 Node.js 腳本，開發者本機執行，用 Supabase service role 金鑰
- 驗證邏輯：
  1. 必填欄位檢查（`name`、`category`、`category_group`、`ip_id`），缺一則跳過並記錄原因
  2. 重複偵測：以「系列 + 商品名稱 + 賞別」組合判斷
  3. 執行後輸出結果報告（成功/跳過/失敗筆數及原因）

### 7.4 官方商品回報流程
- 設定頁提供「回報遺漏項目」按鈕，導向表單頁面，玩家填寫跟 products 相同格式的資訊，寫入 `product_submissions` 表（status='pending'）
- 開發者用 Supabase 內建 Table Editor 查看與核准，**不需自建審核後台介面**
- 核准後用腳本將資料搬移至正式 `products` 表

### 7.5 帳號刪除
- 設定頁提供「刪除帳號」功能，需二次確認（輸入密碼或打字確認）
- 執行後刪除/去識別化：`user_collections`、Storage 中對應照片路徑、`product_submissions` 中的提交紀錄

---

## 8. 資料夾結構

```
collector-village/
├── app/
│   ├── page.tsx
│   ├── login/
│   ├── register/
│   ├── browse/
│   ├── products/[id]/
│   ├── dashboard/
│   ├── wishlist/
│   └── settings/
├── components/
├── lib/
│   ├── supabase/
│   └── utils/              # 含收藏進度計算函式（見第5.1節）
├── types/
├── public/
├── scripts/                 # CSV匯入腳本
├── .env.local
├── package.json
└── next.config.js
```

---

## 9. 隱私與權限

- 收藏資料（`user_collections`）**預設完全私人**，其他使用者一律看不到
- 照片存取權限比照上述私人原則
- 「分享唯讀連結」功能為未來擴充，MVP 不做

---

## 10. 網站必要文字內容

**Footer 免責聲明**（需在網站頁面呈現，非資料庫層級）：本站為非官方粉絲自製之收藏管理工具，與原作、出版社、玩具製造商無任何關聯或授權關係；所有角色、商品名稱、商標均屬原權利人所有；商品資料僅供收藏管理參考，正確性以官方資訊為準。

**服務條款/隱私權政策**：需有獨立頁面，內容涵蓋最低年齡限制（13歲+未滿18歲需法定代理人同意）、禁止上傳不當內容、開發者停權權利等，完整文字待另外撰寫或找範本，此文件僅要求「頁面與連結需存在」。

---

## 11. SEO 策略

`/products/[id]` 商品詳情頁設為 `noindex`（meta robots tag），首頁與 `/browse` 入口正常索引。

---

## 12. MVP 範圍外，明確排除（不要實作）

以下功能經過討論後明確決定**不在此次建置範圍內**，即使規格書其他地方提及背景概念，也不要主動實作：

- 城鎮、工廠（二創UGC生產系統）、超市、算命館、任何社交系統
- 虛擬小屋展示（供其他玩家參觀）
- 遊戲幣/賺錢機制
- 市價觀察日誌功能（改用泛用備註欄位取代）
- 排行榜、玩家間收藏數比較
- 集滿解鎖/兌換機制
- 進度催促推播通知

---

## 13. 商品資料

**已完成**：`collector-village-products-final.csv`（402筆，涵蓋《進擊的巨人》一番賞、扭蛋、公仔、生活雜貨等多個系列），已通過格式驗證（無必填欄位缺漏、無「綜合」誤用、無重複列、價格格式與系列名稱皆已清理），可直接搭配本文件交給 Claude Code 匯入。

商品資料處理採三階段流程：AI草稿（任一工具爬取/整理）→ 自動驗證腳本（檢查是否違反本文件規則，如角色標籤誤用「綜合」、分類用了清單外的值、系列名稱殘留日文、價格格式錯誤等）→ 人工校對（依驗證腳本抓出的問題清單修正）。**建議 Claude Code 在建置階段順便產出這支驗證腳本**，作為 `scripts/validate-import.js` 或類似檔案，供每次匯入新資料批次時使用。資料庫遺漏的商品，依第7.4節「官方商品回報流程」交由玩家陸續回報補足即可，不需一次到位。
