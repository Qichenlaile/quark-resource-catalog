import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = name => readFile(new URL(name, root), "utf8");
const [manifestText, style, script, favicon, views, auth, analytics, contact, worker] = await Promise.all([
  ".openai/hosting.json", "style.css", "catalog.js", "favicon.svg", "sites/views.js", "sites/admin-auth.js", "sites/analytics.js",
  "sites/contact.js", "sites/worker.js"
].map(read));
const manifest = JSON.parse(manifestText);
assert.ok(manifest.project_id && manifest.d1 === "DB" && !manifest.static);

const assets = {
  "/style.css": { body: style, type: "text/css; charset=utf-8" },
  "/catalog.js": { body: script, type: "text/javascript; charset=utf-8" },
  "/favicon.svg": { body: favicon, type: "image/svg+xml" },
};
const bundle = `const siteAssets = ${JSON.stringify(assets)};\n${views}\n${auth}\n${analytics}\n${contact}\n${worker}`;
const artifact = await import("data:text/javascript;base64," + Buffer.from(bundle).toString("base64"));
assert.equal(typeof artifact.default.fetch, "function");

for (const directory of ["dist/server/", "dist/.openai/"]) {
  await mkdir(new URL(directory, root), { recursive: true });
}
await Promise.all([
  writeFile(new URL("dist/server/index.js", root), bundle),
  writeFile(new URL("dist/.openai/hosting.json", root), manifestText),
  cp(new URL("drizzle/", root), new URL("dist/.openai/drizzle/", root), { recursive: true }),
]);
