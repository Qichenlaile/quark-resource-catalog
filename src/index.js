import { Hono } from "hono";
import worker from "../dist/server/index.js";
import { openStorage } from "./storage.js";

const app = new Hono();
let storage;

app.all("*", async ({ req }) => {
  const request = req.raw;
  if (["/style.css", "/catalog.js", "/favicon.svg"].includes(new URL(request.url).pathname)) {
    return worker.fetch(request, {});
  }
  try {
    storage ??= openStorage(process.env).catch(error => {
      storage = undefined;
      throw error;
    });
    return worker.fetch(request, {
      ...await storage,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      ADMIN_SETUP_TOKEN: process.env.ADMIN_SETUP_TOKEN,
      ADMIN_AUTH_MODE: "setup-token",
    });
  } catch (error) {
    console.error("Could not initialize catalog storage:", error.code || error.name);
    return worker.fetch(request, {});
  }
});

export default app;
