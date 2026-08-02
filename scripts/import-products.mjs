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
// 已知缺口第5項（2026-08-02 補上）：Peggy 逐行校對 CSV 時，把確認沒問題的那一列剪下貼到
// CSV 最下面「已審核」分隔列之後（見 scripts/lib/csv-import.mjs 的 REVIEWED_SECTION_MARKER）。
// 這個分隔列之後的資料改成「依 product_code 比對」：DB 裡已經有這個編號就覆蓋更新既有那一列
// （校對時修正的錯字/欄位才會真的反映到資料庫），DB 裡沒有這個編號（校對時新增的商品）才用
// 插入。分隔列之前的資料維持原本的「新增才會被跳過視為重複」邏輯不變，兩邊互不影響。
// 沒有「已審核」分隔列時，行為完全等同於這次修改之前的版本（全部走新增流程），向下相容。
//
// 用 service role 金鑰直接寫入，繞過 RLS（見已定案項目18：不做後台管理介面，改用本機腳本）。

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import {
  CSV_COLUMNS,
  buildColIndex,
  buildDupKey,
  extractRowFields,
  fieldsToProductRecord,
  parseCsv,
  splitReviewedSection,
  validateRowFields,
} from './lib/csv-import.mjs';

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
  const colIndex = buildColIndex(header);

  const { mainRows, reviewedRows, markerIndex } = splitReviewedSection(dataRows);
  console.log(
    markerIndex === -1
      ? `讀到 ${dataRows.length} 筆資料，沒有「已審核」分隔列，全部走新增流程...\n`
      : `讀到 ${mainRows.length} 筆一般資料 + ${reviewedRows.length} 筆已審核資料，開始處理...\n`
  );

  // ---- 準備 ips / series 快取 ----
  const { data: existingIps, error: ipsErr } = await supabase.from('ips').select('id, name');
  if (ipsErr) throw ipsErr;
  const ipCache = new Map(existingIps.map((r) => [r.name, r.id]));

  const { data: existingSeries, error: seriesErr } = await supabase.from('series').select('id, ip_id, name');
  if (seriesErr) throw seriesErr;
  const seriesCache = new Map(existingSeries.map((r) => [`${r.ip_id}::${r.name}`, r.id]));

  // ---- 既有商品的重複偵測 key 集合（系列名稱 + 商品名稱 + 賞別），只給主區塊的新增流程用 ----
  const { data: existingProducts, error: productsErr } = await supabase
    .from('products')
    .select('name, kuji_prize_tier, series:series_id(name)');
  if (productsErr) throw productsErr;
  const dupKeys = new Set(existingProducts.map((p) => buildDupKey(p.series?.name, p.name, p.kuji_prize_tier)));

  // ---- 已審核區塊要用的 product_code -> id 對照表 ----
  const { data: existingByCode, error: codeErr } = await supabase
    .from('products')
    .select('id, product_code')
    .not('product_code', 'is', null);
  if (codeErr) throw codeErr;
  const productIdByCode = new Map(existingByCode.map((r) => [r.product_code, r.id]));

  const skipped = [];
  const warnings = [];
  const toInsert = [];
  const toUpdate = [];
  const toInsertFromReviewed = [];

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

  // ---- 主區塊：一般新增流程（跟這次修改之前完全相同的行為）----
  for (let i = 0; i < mainRows.length; i++) {
    const cols = mainRows[i];
    const rowNum = i + 2; // +1 header, +1 1-indexed
    const fields = extractRowFields(cols, colIndex);

    const { skipReason, warnings: rowWarnings } = validateRowFields(fields);
    if (skipReason) {
      skipped.push({ row: rowNum, name: fields.productName || '(無名稱)', reason: skipReason });
      continue;
    }

    const dupKey = buildDupKey(fields.seriesName, fields.productName, fields.kujiPrizeTier);
    if (dupKeys.has(dupKey)) {
      skipped.push({ row: rowNum, name: fields.productName, reason: '重複商品（系列+名稱+賞別已存在）' });
      continue;
    }

    for (const issue of rowWarnings) warnings.push({ row: rowNum, name: fields.productName, issue });
    dupKeys.add(dupKey); // 同一批次內也要防重複

    const ipId = await resolveIpId(fields.ipName);
    const seriesId = await resolveSeriesId(ipId, fields.seriesName, fields.seriesYear);
    toInsert.push(fieldsToProductRecord(fields, ipId, seriesId));
  }

  // ---- 已審核區塊：依 product_code 比對，DB 有這個編號就更新、沒有就新增 ----
  for (let i = 0; i < reviewedRows.length; i++) {
    const cols = reviewedRows[i];
    const rowNum = markerIndex + i + 3; // marker本身也佔一列，+1 header, +1 1-indexed
    const fields = extractRowFields(cols, colIndex);

    if (!fields.productCode) {
      skipped.push({
        row: rowNum,
        name: fields.productName || '(無名稱)',
        reason: '已審核區塊的資料缺少商品編號，無法比對要更新哪一筆，已跳過',
      });
      continue;
    }

    const { skipReason, warnings: rowWarnings } = validateRowFields(fields);
    if (skipReason) {
      skipped.push({ row: rowNum, name: fields.productName || '(無名稱)', reason: skipReason });
      continue;
    }
    for (const issue of rowWarnings) warnings.push({ row: rowNum, name: fields.productName, issue });

    const ipId = await resolveIpId(fields.ipName);
    const seriesId = await resolveSeriesId(ipId, fields.seriesName, fields.seriesYear);
    const record = fieldsToProductRecord(fields, ipId, seriesId);
    const code = Number(fields.productCode);
    const existingId = productIdByCode.get(code);

    if (existingId) {
      toUpdate.push({ id: existingId, record });
    } else {
      toInsertFromReviewed.push(record);
    }
  }

  // ---- 批次寫入 ----
  const CHUNK_SIZE = 200;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('products').insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }

  let insertedFromReviewed = 0;
  for (let i = 0; i < toInsertFromReviewed.length; i += CHUNK_SIZE) {
    const chunk = toInsertFromReviewed.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('products').insert(chunk);
    if (error) throw error;
    insertedFromReviewed += chunk.length;
  }

  let updated = 0;
  for (const { id, record } of toUpdate) {
    const { error } = await supabase.from('products').update(record).eq('id', id);
    if (error) throw error;
    updated++;
  }

  // ---- 報告 ----
  console.log('========== 匯入結果報告 ==========');
  console.log(`成功匯入（一般新增）：${inserted} 筆`);
  if (markerIndex !== -1) {
    console.log(`已審核區塊 - 覆蓋更新既有資料：${updated} 筆`);
    console.log(`已審核區塊 - 新增（product_code 沒對到既有資料）：${insertedFromReviewed} 筆`);
  }
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
