// 商品資料 CSV 批次匯入腳本
// 用法：node --env-file=.env.local scripts/import-products.mjs [CSV路徑，預設 products.csv]
//
// 規格對應 PROJECT_PROGRESS.md 第18項：
//   1. 必填欄位檢查（product_name / category / category_group / ip_name），缺一則跳過並記錄原因
//   2. 重複偵測：以「系列 + 商品名稱 + 賞別」三者組合判斷，重複時跳過並列入報告
//   3. 執行後輸出結果報告（成功/跳過/警告）
// 另外整合第26項「自動驗證腳本」的內容規則檢查（characters 是否誤填「綜合」、
// category_group 是否為清單外新分類、official_price 格式），這些只列為警告、不擋匯入，
// 因為 category_group 本身允許持續擴充（見已定案項目8），且此份 CSV 已人工複查過。
//
// 用 service role 金鑰直接寫入，繞過 RLS（見已定案項目18：不做後台管理介面，改用本機腳本）。

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const KNOWN_CATEGORY_GROUPS = new Set([
  '立體公仔類', '配戴隨身類', '包袋類', '服裝類',
  '生活雜貨類', '紙製/影像類', '影音類', '出版品類', '布娃娃類',
]);

const CSV_COLUMNS = [
  '商品編號', 'ip_name', 'series_name', 'series_year', 'product_name', 'category_group',
  'category', 'kuji_prize_tier', 'characters', 'character_aliases',
  'manufacturer', 'official_price', 'release_date', 'tags', 'image_url', 'source_url',
];

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function toList(value) {
  if (!value) return null;
  const items = value.split(';').map((v) => v.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

function containsJapaneseKana(value) {
  return /[぀-ゟ゠-ヿ]/.test(value || '');
}

function isValidPriceFormat(value) {
  if (!value) return true; // 空值不算格式錯誤，只是沒填
  return /^¥\d[\d,]*$/.test(value) || /^NT\$\d[\d,]*$/.test(value) || value === '非賣品';
}

async function main() {
  const csvPath = process.argv[2] || 'products.csv';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，請確認 .env.local 並用 --env-file 執行。');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const raw = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
  const allRows = parseCsv(raw);
  const header = allRows[0].map((h) => h.trim());
  const dataRows = allRows.slice(1);

  const missingCols = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missingCols.length > 0) {
    console.error(`CSV 缺少必要欄位：${missingCols.join(', ')}`);
    process.exit(1);
  }
  const colIndex = Object.fromEntries(header.map((h, i) => [h, i]));

  console.log(`讀到 ${dataRows.length} 筆資料，開始處理...\n`);

  // ---- 準備 ips / series 快取 ----
  const { data: existingIps, error: ipsErr } = await supabase.from('ips').select('id, name');
  if (ipsErr) throw ipsErr;
  const ipCache = new Map(existingIps.map((r) => [r.name, r.id]));

  const { data: existingSeries, error: seriesErr } = await supabase.from('series').select('id, ip_id, name');
  if (seriesErr) throw seriesErr;
  const seriesCache = new Map(existingSeries.map((r) => [`${r.ip_id}::${r.name}`, r.id]));

  // ---- 既有商品的重複偵測 key 集合（系列名稱 + 商品名稱 + 賞別） ----
  const { data: existingProducts, error: productsErr } = await supabase
    .from('products')
    .select('name, kuji_prize_tier, series:series_id(name)');
  if (productsErr) throw productsErr;
  const dupKeys = new Set(
    existingProducts.map((p) => `${p.series?.name ?? ''}|${p.name}|${p.kuji_prize_tier ?? ''}`)
  );

  const skipped = [];
  const warnings = [];
  const toInsert = [];

  async function resolveIpId(ipName) {
    if (ipCache.has(ipName)) return ipCache.get(ipName);
    const { data, error } = await supabase.from('ips').insert({ name: ipName }).select('id').single();
    if (error) throw error;
    ipCache.set(ipName, data.id);
    return data.id;
  }

  async function resolveSeriesId(ipId, seriesName, seriesYear) {
    if (!seriesName) return null;
    const key = `${ipId}::${seriesName}`;
    if (seriesCache.has(key)) return seriesCache.get(key);
    const { data, error } = await supabase
      .from('series')
      .insert({ ip_id: ipId, name: seriesName, release_year: seriesYear ? Number(seriesYear) : null })
      .select('id')
      .single();
    if (error) throw error;
    seriesCache.set(key, data.id);
    return data.id;
  }

  for (let i = 0; i < dataRows.length; i++) {
    const cols = dataRows[i];
    const rowNum = i + 2; // +1 header, +1 1-indexed
    const get = (name) => (cols[colIndex[name]] ?? '').trim();

    const productCode = get('商品編號');
    const ipName = get('ip_name');
    const seriesName = get('series_name');
    const seriesYear = get('series_year');
    const productName = get('product_name');
    const categoryGroup = get('category_group');
    const category = get('category');
    const kujiPrizeTier = get('kuji_prize_tier') || null;
    const characters = get('characters');
    const characterAliases = get('character_aliases');
    const manufacturer = get('manufacturer') || null;
    const officialPrice = get('official_price') || null;
    const releaseDate = get('release_date') || null;
    const tags = get('tags');
    const imageUrl = get('image_url') || null;
    const sourceUrl = get('source_url') || null;

    if (!productName || !category || !categoryGroup || !ipName) {
      skipped.push({ row: rowNum, name: productName || '(無名稱)', reason: '缺少必填欄位（商品名稱/分類/大分類/作品）' });
      continue;
    }

    if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
      skipped.push({
        row: rowNum,
        name: productName,
        reason: `release_date 格式異常（值為「${releaseDate}」，疑似該列欄位錯位，請人工檢查原始CSV該列）`,
      });
      continue;
    }

    const dupKey = `${seriesName}|${productName}|${kujiPrizeTier ?? ''}`;
    if (dupKeys.has(dupKey)) {
      skipped.push({ row: rowNum, name: productName, reason: `重複商品（系列+名稱+賞別已存在）` });
      continue;
    }

    if (characters && characters.split(';').some((c) => c.trim() === '綜合')) {
      warnings.push({ row: rowNum, name: productName, issue: 'characters 欄位出現「綜合」，違反第5項規則（角色戲份再少也應個別列出）' });
    }
    if (categoryGroup && !KNOWN_CATEGORY_GROUPS.has(categoryGroup)) {
      warnings.push({ row: rowNum, name: productName, issue: `category_group「${categoryGroup}」不在已知9大分類清單，若非刻意新增分類請確認拼字` });
    }
    if (containsJapaneseKana(seriesName)) {
      warnings.push({ row: rowNum, name: productName, issue: `series_name「${seriesName}」疑似殘留日文假名未轉換` });
    }
    if (!isValidPriceFormat(officialPrice)) {
      warnings.push({ row: rowNum, name: productName, issue: `official_price「${officialPrice}」格式不符 ¥/NT$/非賣品 規則` });
    }

    dupKeys.add(dupKey); // 同一批次內也要防重複

    const ipId = await resolveIpId(ipName);
    const seriesId = await resolveSeriesId(ipId, seriesName, seriesYear);

    toInsert.push({
      product_code: productCode ? Number(productCode) : null,
      ip_id: ipId,
      series_id: seriesId,
      name: productName,
      characters: toList(characters),
      character_aliases: toList(characterAliases),
      category,
      category_group: categoryGroup,
      kuji_prize_tier: kujiPrizeTier,
      manufacturer,
      official_price: officialPrice,
      image_url: imageUrl,
      source_url: sourceUrl,
      release_date: releaseDate,
      tags: toList(tags),
    });
  }

  // ---- 批次寫入 products ----
  const CHUNK_SIZE = 200;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('products').insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }

  // ---- 報告 ----
  console.log('========== 匯入結果報告 ==========');
  console.log(`成功匯入：${inserted} 筆`);
  console.log(`跳過：${skipped.length} 筆`);
  if (skipped.length > 0) {
    for (const s of skipped) console.log(`  - 第${s.row}列「${s.name}」：${s.reason}`);
  }
  console.log(`警告（已匯入，建議之後複查）：${warnings.length} 筆`);
  if (warnings.length > 0) {
    for (const w of warnings) console.log(`  - 第${w.row}列「${w.name}」：${w.issue}`);
  }
  console.log('===================================');
}

main().catch((err) => {
  console.error('匯入過程發生錯誤：', err);
  process.exit(1);
});
