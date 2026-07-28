// 直接對 Supabase Postgres 執行 SQL 檔案的小工具。
// 用法：node --env-file=.env.local scripts/run-sql.mjs <sql檔案路徑>
// 需要 .env.local 裡有 DATABASE_URL（Supabase 專案 Settings > Database > Connection string）。
// 用途：schema.sql 這類建表/改表的 DDL，不透過 Supabase JS client（它不支援任意 SQL），改走直連。

import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('用法：node --env-file=.env.local scripts/run-sql.mjs <sql檔案路徑>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('缺少 DATABASE_URL，請確認 .env.local 並用 --env-file 執行。');
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf-8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log(`已連線，開始執行 ${sqlPath}...`);
  await client.query(sql);
  console.log('執行完成。');
}

main()
  .catch((err) => {
    console.error('執行失敗：', err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
