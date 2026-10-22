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
      if (values.length > 100)
        throw new Error("D1 bound parameter limit exceeded");
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
    batch: async (statements: Statement[]) => {
      if (statements.length > 50)
        throw new Error("D1 free invocation query limit exceeded");
      return sqlite.transaction(() =>
        statements.map((statement) => ({
          success: true,
          results: sqlite.query(statement.sql).all(...statement.values),
        })),
      )();
    },
  } as unknown as D1Database;
  return { db, sqlite };
}
