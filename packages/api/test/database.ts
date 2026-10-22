import { Database } from "bun:sqlite";

/** Run production SQL against SQLite, including D1 batch transaction semantics. */
export async function database() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const directory = `${import.meta.dir}/../migrations`;
  const migrations = Array.from(
    new Bun.Glob("*.sql").scanSync(directory),
  ).sort();
  for (const migration of migrations)
    sqlite.exec(await Bun.file(`${directory}/${migration}`).text());
  class Statement {
    constructor(
      readonly sql: string,
      readonly values: (string | number | null)[] = [],
    ) {}
    bind(...values: (string | number | null)[]) {
      return new Statement(this.sql, values);
    }
    async all() {
      return {
        success: true,
        results: sqlite.query(this.sql).all(...this.values),
      };
    }
    async run() {
      return sqlite.query(this.sql).run(...this.values);
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) =>
      sqlite.transaction(() =>
        statements.map((statement) => ({
          success: true,
          results: sqlite.query(statement.sql).all(...statement.values),
        })),
      )(),
  } as unknown as D1Database;
  return { db, sqlite };
}
