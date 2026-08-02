import { describe, expect, it } from 'vitest';
import {
  buildColIndex,
  buildDupKey,
  extractRowFields,
  fieldsToProductRecord,
  parseCsv,
  splitReviewedSection,
  validateRowFields,
} from './csv-import.mjs';

const HEADER = [
  '商品編號', 'ip_name', 'series_name', 'series_year', 'product_name', 'category_group',
  'category', 'kuji_prize_tier', 'characters', 'character_aliases',
  'manufacturer', 'official_price', 'release_date', 'tags', 'image_url', 'source_url',
];
const colIndex = buildColIndex(HEADER);

function makeRow(overrides: Record<string, string> = {}): string[] {
  const defaults: Record<string, string> = {
    商品編號: '1',
    ip_name: '進擊的巨人',
    series_name: '一番賞',
    series_year: '2026',
    product_name: '里維公仔',
    category_group: '立體公仔類',
    category: '公仔',
    kuji_prize_tier: 'A賞',
    characters: '里維·阿卡曼',
    character_aliases: '兵長',
    manufacturer: 'BANDAI',
    official_price: '¥850',
    release_date: '2026-03-15',
    tags: '一番賞;公仔',
    image_url: '',
    source_url: '',
  };
  const merged = { ...defaults, ...overrides };
  return HEADER.map((h) => merged[h] ?? '');
}

describe('parseCsv', () => {
  it('解析基本的逗號分隔資料', () => {
    const rows = parseCsv('a,b,c\n1,2,3\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('處理雙引號包住、內含逗號的欄位', () => {
    const rows = parseCsv('a,b\n"1,2",3\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1,2', '3'],
    ]);
  });

  it('處理雙引號內的跳脫雙引號（""）', () => {
    const rows = parseCsv('a\n"he said ""hi"""\n');
    expect(rows).toEqual([['a'], ['he said "hi"']]);
  });

  it('忽略完全空白的列', () => {
    const rows = parseCsv('a,b\n1,2\n\n3,4\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});

describe('extractRowFields', () => {
  it('依欄位名稱正確取值並 trim', () => {
    const row = makeRow({ product_name: '  里維公仔  ' });
    const fields = extractRowFields(row, colIndex);
    expect(fields.productName).toBe('里維公仔');
    expect(fields.ipName).toBe('進擊的巨人');
    expect(fields.productCode).toBe('1');
  });

  it('空字串欄位轉成 null（非必填的那幾個）', () => {
    const row = makeRow({ manufacturer: '', official_price: '' });
    const fields = extractRowFields(row, colIndex);
    expect(fields.manufacturer).toBeNull();
    expect(fields.officialPrice).toBeNull();
  });
});

describe('validateRowFields', () => {
  it('必填欄位齊全時沒有 skipReason', () => {
    const fields = extractRowFields(makeRow(), colIndex);
    const result = validateRowFields(fields);
    expect(result.skipReason).toBeNull();
  });

  it('缺少商品名稱時回傳 skipReason', () => {
    const fields = extractRowFields(makeRow({ product_name: '' }), colIndex);
    const result = validateRowFields(fields);
    expect(result.skipReason).toContain('缺少必填欄位');
  });

  it('release_date 格式異常時回傳 skipReason（研判欄位錯位）', () => {
    const fields = extractRowFields(makeRow({ release_date: 'BANDAI' }), colIndex);
    const result = validateRowFields(fields);
    expect(result.skipReason).toContain('release_date 格式異常');
  });

  it('characters 出現「綜合」只列警告，不擋匯入', () => {
    const fields = extractRowFields(makeRow({ characters: '綜合' }), colIndex);
    const result = validateRowFields(fields);
    expect(result.skipReason).toBeNull();
    expect(result.warnings.some((w) => w.includes('綜合'))).toBe(true);
  });

  it('category_group 不在已知清單只列警告，不擋匯入', () => {
    const fields = extractRowFields(makeRow({ category_group: '神秘分類' }), colIndex);
    const result = validateRowFields(fields);
    expect(result.skipReason).toBeNull();
    expect(result.warnings.some((w) => w.includes('神秘分類'))).toBe(true);
  });

  it('official_price 格式不符只列警告，不擋匯入', () => {
    const fields = extractRowFields(makeRow({ official_price: '850円' }), colIndex);
    const result = validateRowFields(fields);
    expect(result.skipReason).toBeNull();
    expect(result.warnings.some((w) => w.includes('official_price'))).toBe(true);
  });

  it('official_price 是「非賣品」時不算格式錯誤', () => {
    const fields = extractRowFields(makeRow({ official_price: '非賣品' }), colIndex);
    const result = validateRowFields(fields);
    expect(result.warnings.some((w) => w.includes('official_price'))).toBe(false);
  });
});

describe('buildDupKey', () => {
  it('用系列+名稱+賞別組合出一致的 key', () => {
    expect(buildDupKey('一番賞', '里維公仔', 'A賞')).toBe(buildDupKey('一番賞', '里維公仔', 'A賞'));
    expect(buildDupKey('一番賞', '里維公仔', 'A賞')).not.toBe(buildDupKey('一番賞', '里維公仔', 'B賞'));
  });
});

describe('fieldsToProductRecord', () => {
  it('把欄位轉成資料庫要寫入的格式，商品編號轉成數字', () => {
    const fields = extractRowFields(makeRow({ 商品編號: '42' }), colIndex);
    const record = fieldsToProductRecord(fields, 10, 20);
    expect(record.product_code).toBe(42);
    expect(record.ip_id).toBe(10);
    expect(record.series_id).toBe(20);
    expect(record.characters).toEqual(['里維·阿卡曼']);
    expect(record.tags).toEqual(['一番賞', '公仔']);
  });

  it('沒有商品編號時 product_code 是 null', () => {
    const fields = extractRowFields(makeRow({ 商品編號: '' }), colIndex);
    const record = fieldsToProductRecord(fields, 10, 20);
    expect(record.product_code).toBeNull();
  });
});

describe('splitReviewedSection（已審核分隔列）', () => {
  it('找不到分隔列時，全部資料都算主區塊，向下相容舊行為', () => {
    const rows = [makeRow({ 商品編號: '1' }), makeRow({ 商品編號: '2' })];
    const { mainRows, reviewedRows, markerIndex } = splitReviewedSection(rows);
    expect(markerIndex).toBe(-1);
    expect(mainRows).toHaveLength(2);
    expect(reviewedRows).toHaveLength(0);
  });

  it('找到分隔列時，把資料切成分隔列前後兩段（不含分隔列本身）', () => {
    const marker = ['已審核', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const rows = [makeRow({ 商品編號: '1' }), marker, makeRow({ 商品編號: '2' }), makeRow({ 商品編號: '3' })];
    const { mainRows, reviewedRows, markerIndex } = splitReviewedSection(rows);
    expect(markerIndex).toBe(1);
    expect(mainRows).toHaveLength(1);
    expect(reviewedRows).toHaveLength(2);
    expect(extractRowFields(reviewedRows[0], colIndex).productCode).toBe('2');
  });

  it('分隔列後面完全沒有資料時，reviewedRows 是空陣列', () => {
    const marker = ['已審核', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const rows = [makeRow({ 商品編號: '1' }), marker];
    const { mainRows, reviewedRows } = splitReviewedSection(rows);
    expect(mainRows).toHaveLength(1);
    expect(reviewedRows).toHaveLength(0);
  });
});
