const adminCookie = "__Host-quark-admin";
const utf8 = new TextEncoder();
const passwordIterations = 100_000;
const attemptWindow = 10 * 60;
const attemptLimit = 8;

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", utf8.encode(value)));
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", utf8.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", salt: utf8.encode(salt), iterations: passwordIterations,
  }, key, 256);
  return hex(hash);
}

function matchesHash(left, right) {
  if (left.length !== right.length) return false;
  let differences = 0;
  for (let index = 0; index < left.length; index++) {
    differences |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return differences === 0;
}

function adminEmail(env) {
  return env.ADMIN_EMAIL?.trim().toLowerCase();
}

function currentTime() {
  return Math.floor(Date.now() / 1000);
}

function requestToken(request) {
  const token = request.headers.get("Cookie")?.split(";").map(value => value.trim())
    .find(value => value.startsWith(adminCookie + "="))?.slice(adminCookie.length + 1);
  return /^[0-9a-f]{64}$/.test(token || "") ? token : null;
}

async function hasAdminSession(request, env) {
  const email = adminEmail(env);
  const token = requestToken(request);
  if (!email || !token) return false;
  return Boolean(await env.DB.prepare(`SELECT 1 FROM admin_sessions s
    JOIN admin_credentials c ON c.email = s.email AND c.salt = s.credential_salt
    WHERE s.token_hash = ? AND s.email = ? AND s.expires_at > ?`)
    .bind(await sha256(token), email, currentTime()).first());
}

function adminRedirect(path, cookie) {
  const headers = new Headers({ Location: path, "Cache-Control": "private, no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function sessionCookie(value, maxAge) {
  const lifetime = maxAge === undefined ? "" : `; Max-Age=${maxAge}`;
  return `${adminCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax${lifetime}`;
}

async function adminForm(request, url, maxLength = 12_000) {
  if (request.headers.get("Origin") !== url.origin) return new Response(null, { status: 403 });
  if (!request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded")) {
    return new Response(null, { status: 415 });
  }
  const body = await request.text();
  return body.length <= maxLength ? new URLSearchParams(body) : new Response(null, { status: 413 });
}

async function adminLogin(request, url, env) {
  if (request.method === "GET") {
    const notice = url.searchParams.has("saved") ? "网站管理密码已设置，请登录。" : "";
    return htmlResponse(loginPage({ notice, active: await hasAdminSession(request, env) }));
  }
  if (request.method !== "POST") return methodNotAllowed("GET, POST");
  const form = await adminForm(request, url);
  if (form instanceof Response) return form;
  const email = (form.get("email") || "").trim().toLowerCase().slice(0, 254);
  const password = form.get("password") || "";
  const reject = (error, status = 401) => htmlResponse(loginPage({ email, error }), status);
  if (email !== adminEmail(env) || password.length < 14 || password.length > 128) {
    return reject("账号或密码不正确。");
  }
  const db = env.DB;
  const now = currentTime();
  const clientHeader = env.ADMIN_AUTH_MODE === "setup-token" ? "x-vercel-forwarded-for" : "CF-Connecting-IP";
  const client = await sha256(request.headers.get(clientHeader) || "site");
  const windowStart = now - now % attemptWindow;
  const attempt = await db.prepare(`INSERT INTO admin_login_attempts (client_key, window_start, attempts)
    VALUES (?, ?, 1) ON CONFLICT(client_key) DO UPDATE SET
    attempts = CASE WHEN window_start = excluded.window_start THEN min(attempts + 1, ?) ELSE 1 END,
    window_start = excluded.window_start RETURNING attempts`)
    .bind(client, windowStart, attemptLimit + 1).first();
  if (attempt.attempts > attemptLimit) return reject("尝试次数过多，请稍后再试。", 429);
  const credential = await db.prepare("SELECT salt, password_hash FROM admin_credentials WHERE email = ?")
    .bind(email).first();
  if (!credential || !matchesHash(await passwordHash(password, credential.salt), credential.password_hash)) {
    return reject("账号或密码不正确。");
  }
  const remember = form.get("remember") === "1";
  const lifetime = remember ? 30 * 24 * 60 * 60 : 12 * 60 * 60;
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const result = await db.prepare(`INSERT INTO admin_sessions (token_hash, email, credential_salt, expires_at)
    SELECT ?, email, salt, ? FROM admin_credentials WHERE email = ? AND salt = ?`)
    .bind(await sha256(token), now + lifetime, email, credential.salt).run();
  if (!result.meta.changes) return reject("密码已更新，请重新登录。");
  return adminRedirect("/admin", sessionCookie(token, remember ? lifetime : undefined));
}

async function adminAccount(request, url, env) {
  const owner = adminEmail(env);
  const requiresToken = env.ADMIN_AUTH_MODE === "setup-token";
  const setupToken = env.ADMIN_SETUP_TOKEN;
  if (requiresToken) {
    if (!owner || !setupToken || setupToken.length < 32 || setupToken.length > 128) {
      return htmlResponse(accountPage({ unavailable: true }), 503);
    }
  } else {
    const viewer = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
    if (!owner || viewer !== owner) {
      const status = viewer ? 403 : 401;
      const message = viewer ? "请切换到站点所有者的 ChatGPT 账号。" : "请先验证站点所有者身份。";
      return htmlResponse(accountPage({ verify: message }), status);
    }
  }
  if (request.method === "GET") return htmlResponse(accountPage({ requiresToken }));
  if (request.method !== "POST") return methodNotAllowed("GET, POST");
  const form = await adminForm(request, url);
  if (form instanceof Response) return form;
  if (requiresToken && !matchesHash(await sha256(form.get("setupToken") || ""), await sha256(setupToken))) {
    return htmlResponse(accountPage({ requiresToken, error: "设置密钥不正确。" }), 403);
  }
  const password = form.get("password") || "";
  const confirmation = form.get("confirm") || "";
  if (password.length < 14 || password.length > 128 || password !== confirmation) {
    return htmlResponse(accountPage({ requiresToken, error: "请输入 14 至 128 位字符，两次密码须一致。" }), 422);
  }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const digest = await passwordHash(password, salt);
  const db = env.DB;
  await db.batch([
    db.prepare(`INSERT INTO admin_credentials (email, salt, password_hash) VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET salt = excluded.salt, password_hash = excluded.password_hash`)
      .bind(owner, salt, digest),
    db.prepare("DELETE FROM admin_sessions WHERE email = ? OR expires_at <= ?").bind(owner, currentTime()),
    db.prepare("DELETE FROM admin_login_attempts WHERE window_start < ?").bind(currentTime() - attemptWindow),
  ]);
  return adminRedirect("/admin/login?saved=1", sessionCookie("", 0));
}

async function adminLogout(request, url, env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const form = await adminForm(request, url);
  if (form instanceof Response) return form;
  const token = requestToken(request);
  if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return adminRedirect("/admin/login", sessionCookie("", 0));
}
