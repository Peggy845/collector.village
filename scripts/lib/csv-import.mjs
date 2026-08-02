// products.csv 匯入邏輯裡不需要碰資料庫的純函式，從 scripts/import-products.mjs 抽出來，
// 方便寫自動化測試（不用連真實 Supabase 也能驗證解析/驗證/分區邏輯），也讓
// scripts/import-products.mjs 本身只留 Supabase I/O 的部分。

export const KNOWN_CATEGORY_GROUPS = new Set([
  '立體公仔類', '配戴隨身類', '包袋類', '服裝類',
  '生活雜貨類', '紙製/影像類', '影音類', '出版品類', '布娃娃類',
]);

export const CSV_COLUMNS = [
  '商品編號', 'ip_name', 'series_name', 'series_year', 'product_name', 'category_group',
  'category', 'kuji_prize_tier', 'characters', 'character_aliases',
  'manufacturer', 'official_price', 'release_date', 'tags', 'image_url', 'source_url',
];

// Peggy 校對 products.csv 時，把確認沒問題的那一列剪下貼到CSV最下面、這個分隔列之後
// （見 PROJECT_PROGRESS.md 已知缺口第5項）。這個分隔列只有第一欄要填「已審核」三個字，
// 其餘欄位留空即可，程式只認第一欄的文字。
export const REVIEWED_SECTION_MARKER = '已審核';

export function parseCsv(text) {
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

export function toList(value) {
  if (!value) return null;
  const items = value.split(';').map((v) => v.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

export function containsJapaneseKana(value) {
  return /[぀-ゟ゠-ヿ]/.test(value || '');
}

export function isValidPriceFormat(value) {
  if (!value) return true; // 空值不算格式錯誤，只是沒填
  return /^¥\d[\d,]*$/.test(value) || /^NT\$\d[\d,]*$/.test(value) || value === '非賣品';
}

export function buildColIndex(header) {
  return Object.fromEntries(header.map((h, i) => [h, i]));
}

export function extractRowFields(cols, colIndex) {
  const get = (name) => (cols[colIndex[name]] ?? '').trim();
  return {
    productCode: get('商品編號'),
    ipName: get('ip_name'),
    seriesName: get('series_name'),
    seriesYear: get('series_year'),
    productName: get('product_name'),
    categoryGroup: get('category_group'),
    category: get('category'),
    kujiPrizeTier: get('kuji_prize_tier') || null,
    characters: get('characters'),
    characterAliases: get('character_aliases'),
    manufacturer: get('manufacturer') || null,
    officialPrice: get('official_price') || null,
    releaseDate: get('release_date') || null,
    tags: get('tags'),
    imageUrl: get('image_url') || null,
    sourceUrl: get('source_url') || null,
  };
}

// 必填欄位缺漏／release_date 格式異常會擋匯入（回傳 skipReason）；
// characters=綜合／未知分類/日文假名殘留/價格格式不符只列為 warnings，不擋匯入。
export function validateRowFields(fields) {
  const warnings = [];

  if (!fields.productName || !fields.category || !fields.categoryGroup || !fields.ipName) {
    return { skipReason: '缺少必填欄位（商品名稱/分類/大分類/作品）', warnings };
  }

  if (fields.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(fields.releaseDate)) {
    return {
      skipReason: `release_date 格式異常（值為「${fields.releaseDate}」，疑似該列欄位錯位，請人工檢查原始CSV該列）`,
      warnings,
    };
  }

  if (fields.characters && fields.characters.split(';').some((c) => c.trim() === '綜合')) {
    warnings.push('characters 欄位出現「綜合」，違反第5項規則（角色戲份再少也應個別列出）');
  }
  if (fields.categoryGroup && !KNOWN_CATEGORY_GROUPS.has(fields.categoryGroup)) {
    warnings.push(`category_group「${fields.categoryGroup}」不在已知9大分類清單，若非刻意新增分類請確認拼字`);
  }
  if (containsJapaneseKana(fields.seriesName)) {
    warnings.push(`series_name「${fields.seriesName}」疑似殘留日文假名未轉換`);
  }
  if (!isValidPriceFormat(fields.officialPrice)) {
    warnings.push(`official_price「${fields.officialPrice}」格式不符 ¥/NT$/非賣品 規則`);
  }

  return { skipReason: null, warnings };
}

export function buildDupKey(seriesName, productName, kujiPrizeTier) {
  return `${seriesName ?? ''}|${productName ?? ''}|${kujiPrizeTier ?? ''}`;
}

export function fieldsToProductRecord(fields, ipId, seriesId) {
  return {
    product_code: fields.productCode ? Number(fields.productCode) : null,
    ip_id: ipId,
    series_id: seriesId,
    name: fields.productName,
    characters: toList(fields.characters),
    character_aliases: toList(fields.characterAliases),
    category: fields.category,
    category_group: fields.categoryGroup,
    kuji_prize_tier: fields.kujiPrizeTier,
    manufacturer: fields.manufacturer,
    official_price: fields.officialPrice,
    image_url: fields.imageUrl,
    source_url: fields.sourceUrl,
    release_date: fields.releaseDate,
    tags: toList(fields.tags),
  };
}

// 把資料列切成「主區塊」（原本的新增流程，找不到分隔列時就是全部資料，行為完全向下相容）跟
// 「已審核區塊」（依 product_code 覆蓋更新既有資料列，見 REVIEWED_SECTION_MARKER 說明）。
export function splitReviewedSection(dataRows) {
  const markerIndex = dataRows.findIndex((cols) => (cols[0] ?? '').trim() === REVIEWED_SECTION_MARKER);
  if (markerIndex === -1) {
    return { mainRows: dataRows, reviewedRows: [], markerIndex: -1 };
  }
  return {
    mainRows: dataRows.slice(0, markerIndex),
    reviewedRows: dataRows.slice(markerIndex + 1),
    markerIndex,
  };
}
