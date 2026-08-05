// 最小可用的假 Supabase client，只實作 lib/market/listing.ts 跟 lib/market/restock.ts
// 實際用到的查詢語法子集（from/select/eq/gt/in/order/maybeSingle/update/insert/delete）。
// 不是完整的 postgrest 模擬器，只求測試這兩支檔案的排程/併發邏輯時行為跟真的資料庫一致。
type Row = Record<string, unknown>;

let idCounter = 1;

type Mode = 'select' | 'update' | 'insert' | 'delete';

export class FakeSupabase {
  private tables = new Map<string, Row[]>();
  private beforeExecuteHooks: { table: string; mode: Mode; run: () => void }[] = [];

  seed(table: string, rows: Row[]) {
    this.tables.set(
      table,
      rows.map((r) => ({ ...r }))
    );
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])];
  }

  mutableRows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  from(table: string) {
    return new FakeBuilder(this, table);
  }

  // 測試用：模擬「這次寫入實際送出前，另一個請求先一步改了資料」的競態情境，
  // 讓樂觀鎖（.eq('quantity', ...) 這類寫入前條件）真的有機會match失敗。
  onceBeforeExecute(table: string, mode: Mode, run: () => void) {
    this.beforeExecuteHooks.push({ table, mode, run });
  }

  consumeHook(table: string, mode: Mode) {
    const idx = this.beforeExecuteHooks.findIndex((h) => h.table === table && h.mode === mode);
    if (idx === -1) return;
    const [hook] = this.beforeExecuteHooks.splice(idx, 1);
    hook.run();
  }
}

class FakeBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private filters: ((row: Row) => boolean)[] = [];
  private mode: Mode = 'select';
  private mutationValues: Row | null = null;
  private wantSelect = false;
  private single = false;
  private orderCol: string | null = null;
  private orderAsc = true;

  constructor(
    private db: FakeSupabase,
    private table: string
  ) {}

  select() {
    this.wantSelect = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push((r) => (r[col] as number) > (val as number));
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push((r) => (r[col] as string) >= (val as string));
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push((r) => (r[col] as string) <= (val as string));
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  update(values: Row) {
    this.mode = 'update';
    this.mutationValues = values;
    return this;
  }
  insert(values: Row) {
    this.mode = 'insert';
    this.mutationValues = values;
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }

  private matchedReadOnly(): Row[] {
    const rows = this.db.rows(this.table);
    let result = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderCol) {
      const col = this.orderCol;
      result = [...result].sort((a, b) => {
        const av = a[col] as string | number;
        const bv = b[col] as string | number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    return result;
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): { data: unknown; error: null } {
    this.db.consumeHook(this.table, this.mode);
    if (this.mode === 'select') {
      const rows = this.matchedReadOnly();
      if (this.single) return { data: rows[0] ? { ...rows[0] } : null, error: null };
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
    const table = this.db.mutableRows(this.table);
    if (this.mode === 'insert') {
      const newRow = { id: idCounter++, ...this.mutationValues };
      table.push(newRow);
      return { data: this.wantSelect ? [{ ...newRow }] : null, error: null };
    }
    const matchedRows = table.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === 'update') {
      for (const row of matchedRows) Object.assign(row, this.mutationValues);
      return { data: this.wantSelect ? matchedRows.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.mode === 'delete') {
      const remaining = table.filter((r) => !matchedRows.includes(r));
      table.length = 0;
      table.push(...remaining);
      return { data: this.wantSelect ? matchedRows.map((r) => ({ ...r })) : null, error: null };
    }
    return { data: null, error: null };
  }
}
