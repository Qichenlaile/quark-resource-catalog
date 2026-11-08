import assert from "node:assert/strict";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = name => readFile(new URL(name, root), "utf8");
const [style, script, favicon, views, auth, analytics, contact, worker] = await Promise.all([
  "style.css", "catalog.js", "favicon.svg", "sites/views.js", "sites/admin-auth.js", "sites/analytics.js",
  "sites/contact.js", "sites/worker.js"
].map(read));

const assets = {
  "/style.css": { body: style, type: "text/css; charset=utf-8" },
  "/catalog.js": { body: script, type: "text/javascript; charset=utf-8" },
  "/favicon.svg": { body: favicon, type: "image/svg+xml" },
};
const bundle = `const siteAssets = ${JSON.stringify(assets)};\n${views}\n${auth}\n${analytics}\n${contact}\n${worker}`;
const artifact = await import("data:text/javascript;base64," + Buffer.from(bundle).toString("base64"));
assert.equal(typeof artifact.default.fetch, "function");

await mkdir(new URL("dist/server/", root), { recursive: true });
await writeFile(new URL("dist/server/index.js", root), bundle);

if (process.argv.includes("--vercel")) {
  const names = (await readdir(new URL("drizzle/", root))).filter(name => name.endsWith(".sql")).sort();
  const migrations = await Promise.all(names.map(async name => ({
    name,
    statements: (await read(`drizzle/${name}`)).split("--> statement-breakpoint").map(sql => sql.trim()).filter(Boolean),
  })));
  await writeFile(new URL("dist/server/migrations.js", root), `export default ${JSON.stringify(migrations)};\n`);
} else {
  const manifestText = await read(".openai/hosting.json");
  const manifest = JSON.parse(manifestText);
  assert.ok(manifest.project_id && manifest.d1 === "DB" && !manifest.static);
  await mkdir(new URL("dist/.openai/", root), { recursive: true });
  await Promise.all([
    writeFile(new URL("dist/.openai/hosting.json", root), manifestText),
    cp(new URL("drizzle/", root), new URL("dist/.openai/drizzle/", root), { recursive: true }),
  ]);
}
