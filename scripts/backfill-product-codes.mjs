// 一次性工具：把 products.csv 裡的「商品編號」欄回填到資料庫既有的 products.product_code 欄位。
// 用法：node --env-file=.env.local scripts/backfill-product-codes.mjs [CSV路徑，預設 products.csv]
//
// 背景（見 PROJECT_PROGRESS.md「待討論」第1項）：Peggy 開始逐行校對 CSV 前，
// 需要先讓資料庫既有的 400 筆資料都對應到 CSV 裡的商品編號，之後不管校對時怎麼改文字內容，
// 都能用編號準確比對回同一筆資料，不受「系列+名稱+賞別」文字比對失準影響。
//
// 比對方式沿用 scripts/import-products.mjs 既有的重複偵測 key（系列名稱+商品名稱+賞別），
// 這是目前資料庫裡唯一能拿來對應回 CSV 列的依據。

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

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

  console.log(`讀到 ${dataRows.length} 筆 CSV 資料，開始比對資料庫既有商品...\n`);

  const { data: existingProducts, error: productsErr } = await supabase
    .from('products')
    .select('id, name, kuji_prize_tier, product_code, series:series_id(name)');
  if (productsErr) throw productsErr;

  const dbByKey = new Map();
  for (const p of existingProducts) {
    const key = `${p.series?.name ?? ''}|${p.name}|${p.kuji_prize_tier ?? ''}`;
    dbByKey.set(key, p);
  }

  const updates = [];
  const unmatchedCsvRows = [];
  const alreadySet = [];

  for (let i = 0; i < dataRows.length; i++) {
    const cols = dataRows[i];
    const rowNum = i + 2;
    const get = (name) => (cols[colIndex[name]] ?? '').trim();

    const productCode = get('商品編號');
    const seriesName = get('series_name');
    const productName = get('product_name');
    const kujiPrizeTier = get('kuji_prize_tier') || '';

    if (!productCode || !productName) continue;

    const key = `${seriesName}|${productName}|${kujiPrizeTier}`;
    const dbRow = dbByKey.get(key);

    if (!dbRow) {
      unmatchedCsvRows.push({ row: rowNum, code: productCode, name: productName });
      continue;
    }

    if (dbRow.product_code === Number(productCode)) {
      alreadySet.push(dbRow.id);
      continue;
    }

    updates.push({ id: dbRow.id, product_code: Number(productCode), name: productName });
  }

  console.log(`比對結果：可回填 ${updates.length} 筆，已是正確編號 ${alreadySet.length} 筆，CSV裡找不到對應資料庫紀錄 ${unmatchedCsvRows.length} 筆\n`);

  for (const u of updates) {
    const { error } = await supabase.from('products').update({ product_code: u.product_code }).eq('id', u.id);
    if (error) {
      console.error(`  - 更新失敗 id=${u.id}「${u.name}」：${error.message}`);
    }
  }

  console.log('========== 回填結果報告 ==========');
  console.log(`成功回填：${updates.length} 筆`);
  console.log(`原本就正確：${alreadySet.length} 筆`);
  console.log(`CSV 有編號但資料庫找不到對應商品（尚未匯入，之後修正錯位重新匯入時會自然帶入編號）：${unmatchedCsvRows.length} 筆`);
  if (unmatchedCsvRows.length > 0) {
    for (const r of unmatchedCsvRows) console.log(`  - 第${r.row}列 編號${r.code}「${r.name}」`);
  }

  const { data: stillNull, error: nullErr } = await supabase
    .from('products')
    .select('id, name')
    .is('product_code', null);
  if (nullErr) throw nullErr;
  console.log(`資料庫裡回填後仍無編號的商品：${stillNull.length} 筆`);
  if (stillNull.length > 0) {
    for (const p of stillNull) console.log(`  - id=${p.id}「${p.name}」`);
  }
  console.log('===================================');
}

main().catch((err) => {
  console.error('執行過程發生錯誤：', err);
  process.exit(1);
});
