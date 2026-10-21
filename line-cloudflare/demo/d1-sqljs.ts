// ブラウザ用デモ：D1 の API（prepare / bind / first / all / run / batch）を sql.js で再現する
type SqlJsDb = {
  prepare(sql: string): { bind(p: unknown[]): void; step(): boolean; getAsObject(): Record<string, unknown>; free(): void };
  exec(sql: string): unknown;
  getRowsModified(): number;
};

class Stmt {
  constructor(private db: SqlJsDb, private sql: string, private params: unknown[] = []) {}

  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params.map((p) => (p === undefined ? null : p)));
  }

  exec() {
    const st = this.db.prepare(this.sql);
    st.bind(this.params);
    const results: Record<string, unknown>[] = [];
    while (st.step()) results.push(st.getAsObject());
    st.free();
    return { success: true, results, meta: { changes: this.db.getRowsModified() } };
  }

  async all() { return this.exec(); }
  async run() { return this.exec(); }
  async first(col?: string) {
    const row = this.exec().results[0] ?? null;
    return col && row ? row[col] : row;
  }
}

export function createD1(db: SqlJsDb) {
  return {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => stmts.map((s) => s.exec()),
    exec: async (sql: string) => { db.exec(sql); return { count: 0, duration: 0 }; },
  } as unknown as D1Database;
}
