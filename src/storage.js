import { createClient } from "@libsql/client";
import migrations from "../dist/server/migrations.js";

const contactMigration = {
  name: "vercel-contact-v1",
  statements: [`CREATE TABLE IF NOT EXISTS site_contact (
    key TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL,
    etag TEXT NOT NULL,
    published TEXT NOT NULL
  )`],
};
const schema = [...migrations, contactMigration];
const migrationTable = "CREATE TABLE IF NOT EXISTS vercel_migrations (name TEXT PRIMARY KEY NOT NULL)";
const appliedMigrations = "SELECT name FROM vercel_migrations";

async function migrate(client) {
  await client.execute(migrationTable);
  const applied = new Set((await client.execute(appliedMigrations)).rows.map(row => row.name));
  if (schema.every(({ name }) => applied.has(name))) return;
  const transaction = await client.transaction("write");
  try {
    const applied = new Set((await transaction.execute(appliedMigrations)).rows.map(row => row.name));
    for (const { name, statements } of schema) {
      if (applied.has(name)) continue;
      await transaction.batch([...statements, {
        sql: "INSERT INTO vercel_migrations (name) VALUES (?)", args: [name],
      }]);
    }
    await transaction.commit();
  } finally {
    transaction.close();
  }
}

function adaptResult(result) {
  return { results: result.rows, meta: { changes: result.rowsAffected } };
}

function database(client) {
  return {
    prepare(sql) {
      const statement = args => ({
        query: { sql, args },
        bind: (...values) => statement(values),
        async first() {
          return (await client.execute({ sql, args })).rows[0] ?? null;
        },
        async all() {
          return adaptResult(await client.execute({ sql, args }));
        },
        async run() {
          return adaptResult(await client.execute({ sql, args }));
        },
      });
      return statement([]);
    },
    async batch(statements) {
      return (await client.batch(statements.map(statement => statement.query), "write")).map(adaptResult);
    },
  };
}

function contactObject(row) {
  if (!row) return null;
  return {
    etag: row.etag,
    httpEtag: `"${row.etag}"`,
    customMetadata: { published: row.published },
    json: () => JSON.parse(row.content),
  };
}

function contactStore(client) {
  return {
    async head(key) {
      const result = await client.execute({
        sql: "SELECT etag, published FROM site_contact WHERE key = ?", args: [key],
      });
      return contactObject(result.rows[0]);
    },
    async get(key) {
      const result = await client.execute({
        sql: "SELECT content, etag, published FROM site_contact WHERE key = ?", args: [key],
      });
      return contactObject(result.rows[0]);
    },
    async put(key, content, { onlyIf, customMetadata }) {
      const etag = crypto.randomUUID();
      const published = customMetadata.published;
      const existing = onlyIf.get("If-Match");
      const result = await client.execute(existing
        ? { sql: "UPDATE site_contact SET content = ?, etag = ?, published = ? WHERE key = ? AND etag = ?",
            args: [content, etag, published, key, existing.slice(1, -1)] }
        : { sql: "INSERT INTO site_contact (key, content, etag, published) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO NOTHING",
            args: [key, content, etag, published] });
      return result.rowsAffected ? contactObject({ content, etag, published }) : null;
    },
  };
}

export async function openStorage(env) {
  const url = env.TURSO_DATABASE_URL?.trim();
  const authToken = env.TURSO_AUTH_TOKEN?.trim();
  const local = url?.startsWith("file:") && env.VERCEL !== "1" && env.NODE_ENV !== "production";
  if (!url || (!local && (!/^(libsql|https|wss):\/\//i.test(url) || !authToken))) {
    throw new Error("A Turso database URL and auth token are required.");
  }
  const client = createClient({ url, authToken });
  try {
    await migrate(client);
    return { DB: database(client), CONTACT: contactStore(client) };
  } catch (error) {
    client.close();
    throw error;
  }
}
