import type { D1Database } from "@cloudflare/workers-types";
import { hashPassword } from "better-auth/crypto";

export type AccountDatabase = Pick<D1Database, "prepare" | "batch">;

/** Shared by the local operator CLI and isolated tests, never an HTTP endpoint. */
export async function provisionAccount(
  db: AccountDatabase,
  input: {
    action: "create" | "reset";
    email: string;
    name?: string;
    password: string;
  },
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address");
  if (input.password.length < 12 || input.password.length > 128)
    throw new Error("Password must contain 12–128 characters");
  const name = input.name?.trim() || "Administrator";
  if (name.length > 100) throw new Error("Name must be at most 100 characters");
  const existing = await db
    .prepare("SELECT id FROM auth_user WHERE email = ?")
    .bind(email)
    .all<{ id: string }>();
  const userId = existing.results[0]?.id;
  if (input.action === "create" && userId)
    throw new Error("Account already exists; use reset to change its password");
  if (input.action === "reset" && !userId)
    throw new Error("Account does not exist");
  const hash = await hashPassword(input.password);
  const now = new Date().toISOString();
  if (input.action === "create") {
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "INSERT INTO auth_user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)",
        )
        .bind(id, name, email, now, now),
      db
        .prepare(
          "INSERT INTO auth_account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, 'credential', ?, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), id, id, hash, now, now),
    ]);
  } else {
    await db.batch([
      db
        .prepare(
          "UPDATE auth_account SET password = ?, updatedAt = ? WHERE userId = ? AND providerId = 'credential'",
        )
        .bind(hash, now, userId ?? null),
      db
        .prepare("UPDATE auth_user SET updatedAt = ? WHERE id = ?")
        .bind(now, userId ?? null),
      db
        .prepare("DELETE FROM auth_session WHERE userId = ?")
        .bind(userId ?? null),
    ]);
  }
}
