const validCode = /^[a-z0-9]{4,10}$/;
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" });

function htmlResponse(body, status = 200, formTargets = "'self'", allowContactImages = false) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": `default-src 'self'; base-uri 'none'; form-action ${formTargets}${allowContactImages ? "; img-src 'self' data:" : ""}`,
    },
  });
}

function listResources(db, trashed = 0) {
  return db.prepare("SELECT * FROM resources WHERE trashed = ? ORDER BY rowid DESC")
    .bind(trashed).all().then(result => result.results);
}

function catalogState(params) {
  const section = params.get("section");
  return {
    q: (params.get("q") || "").trim().slice(0, 200),
    section: sections.has(section) ? section : "",
    layout: params.get("layout") === "grid" ? "grid" : "",
    sort: params.get("sort") === "views" ? "views" : "",
    page: /^[1-9]\d{0,5}$/.test(params.get("page") || "") ? params.get("page") : "",
  };
}

function notFound() {
  return htmlResponse(noticePage("资料未找到", "这条资料可能已下架。"), 404);
}

function methodNotAllowed(allow) {
  return new Response(null, { status: 405, headers: { Allow: allow } });
}

function isQuarkShare(value) {
  if (value.length > 500 || /[\s\\\u0000-\u001f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.host === "pan.quark.cn"
      && !url.username && !url.password && /^\/s\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function resourceError(title, url) {
  if (!title || title.length > 120) return "请填写 120 字以内的资料标题。";
  if (!isQuarkShare(url)) return "请输入有效的夸克分享链接。";
  return "";
}

function insertResource(db, title, url) {
  const code = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  return {
    code,
    statement: db.prepare(`INSERT INTO resources (code, title, category, description, url, added)
      SELECT ?, ?, '未分类', '', ?, ? WHERE NOT EXISTS (SELECT 1 FROM resources WHERE url = ?)`)
      .bind(code, title, url, dateFormatter.format(new Date()), url),
  };
}

async function saveResource(db, item) {
  const { code, title, url } = item;
  const error = resourceError(title, url);
  if (error) return { error };
  const duplicate = "这条夸克链接已录入，请检查资料列表或回收站。";
  if (code) {
    const result = await db.prepare(`UPDATE resources SET title = ?, link_reported = CASE WHEN url = ? THEN link_reported ELSE 0 END, url = ?
      WHERE code = ? AND trashed = 0 AND (url = ? OR NOT EXISTS (SELECT 1 FROM resources WHERE url = ? AND code <> ?))`)
      .bind(title, url, url, code, url, url, code).run();
    if (result.meta.changes) return { code };
    const active = await db.prepare("SELECT 1 FROM resources WHERE code = ? AND trashed = 0").bind(code).first();
    return { error: active ? duplicate : "找不到这条资料，请检查回收站。" };
  }
  const entry = insertResource(db, title, url);
  const result = await entry.statement.run();
  return result.meta.changes ? { code: entry.code } : { error: duplicate };
}

async function previewBulk(db, input) {
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0 || lines.length > 20) {
    return { input, rows: [], error: "每次请输入 1 至 20 条资料。" };
  }
  const links = (await db.prepare("SELECT url FROM resources").all()).results;
  const seen = new Set(links.map(item => item.url));
  const rows = lines.map(line => {
    const match = line.match(/^(.+?)\s+(https:\/\/\S+)$/);
    if (!match) return { title: line, error: "请用空格或制表符分隔标题和链接。" };
    const [, title, url] = match;
    const error = resourceError(title, url) || (seen.has(url) ? "重复链接" : "");
    if (!error) seen.add(url);
    return { title, url, error };
  });
  return { input, rows };
}

async function handleResourceAction(request, url, db, code, action) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const form = await adminForm(request, url, 2_000);
  if (form instanceof Response) return form;
  if (action === "open") {
    const { item, cookie } = await recordActivity(request, db, code, true);
    return item && isQuarkShare(item.url) ? adminRedirect(new URL(item.url).href, cookie) : notFound();
  }
  const result = await db.prepare("UPDATE resources SET link_reported = 1 WHERE code = ? AND trashed = 0 AND url = ?")
    .bind(code, form.get("url") || "").run();
  return adminRedirect(`/${code}${result.meta.changes ? "?reported=1" : ""}`);
}

async function handleAdmin(request, url, env) {
  if (!(await hasAdminSession(request, env))) {
    if (request.method === "GET") return adminRedirect("/admin/login");
    return new Response(null, { status: 401 });
  }

  if (url.pathname === "/admin/contact") return await handleContactAdmin(request, url, env.CONTACT);
  if (url.pathname === "/admin/analytics") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    const days = url.searchParams.get("days") === "30" ? 30 : 7;
    return htmlResponse(analyticsPage(await resourceAnalytics(env.DB, days)));
  }

  if (request.method === "GET") {
    const recycle = url.searchParams.get("recycle") === "1";
    const resources = await listResources(env.DB, Number(recycle));
    const draft = recycle ? undefined : resources.find(item => item.code === url.searchParams.get("edit"));
    const saved = recycle ? undefined : resources.find(item => item.code === url.searchParams.get("saved"));
    const imported = url.searchParams.get("imported");
    const skipped = url.searchParams.get("skipped");
    const notice = /^\d{1,2}$/.test(imported || "") && /^\d{1,2}$/.test(skipped || "")
      ? `已导入 ${imported} 条，跳过 ${skipped} 条。` : "";
    return htmlResponse(adminPage(resources, { recycle, draft, saved, notice }));
  }
  if (request.method !== "POST") return methodNotAllowed("GET, POST");
  const form = await adminForm(request, url, 60_000);
  if (form instanceof Response) return form;
  const code = form.get("code") || "";
  const action = form.get("action");
  if (code && !validCode.test(code)) return new Response(null, { status: 400 });

  if (action === "save") {
    const draft = { code };
    for (const field of ["title", "url"]) {
      draft[field] = (form.get(field) || "").trim();
    }
    const { code: saved, error } = await saveResource(env.DB, draft);
    if (error) return htmlResponse(adminPage(await listResources(env.DB), { draft, error }), 422);
    return adminRedirect("/admin?saved=" + saved);
  }
  if (action === "preview-bulk" || action === "save-bulk") {
    const bulk = await previewBulk(env.DB, form.get("bulk") || "");
    if (action === "preview-bulk" || bulk.error) {
      return htmlResponse(adminPage(await listResources(env.DB), { bulk }), bulk.error ? 422 : 200);
    }
    const valid = bulk.rows.filter(item => !item.error);
    const results = valid.length
      ? await env.DB.batch(valid.map(item => insertResource(env.DB, item.title, item.url).statement))
      : [];
    const saved = results.reduce((total, result) => total + result.meta.changes, 0);
    return adminRedirect(`/admin?imported=${saved}&skipped=${bulk.rows.length - saved}`);
  }
  if (code && action === "dismiss-report") {
    await env.DB.prepare("UPDATE resources SET link_reported = 0 WHERE code = ? AND trashed = 0").bind(code).run();
    return adminRedirect("/admin");
  }
  if (code && (action === "trash" || action === "restore")) {
    const trashed = action === "trash" ? 1 : 0;
    await env.DB.prepare("UPDATE resources SET trashed = ? WHERE code = ?").bind(trashed, code).run();
    return Response.redirect(new URL(trashed ? "/admin" : "/admin?recycle=1", url), 303);
  }
  return new Response(null, { status: 400 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const head = request.method === "HEAD";
    const read = head || request.method === "GET";
    const send = response => head ? new Response(null, response) : response;
    try {
      const asset = siteAssets[url.pathname];
      if (asset) {
        if (!read) return methodNotAllowed("GET, HEAD");
        return new Response(head ? null : asset.body, {
          headers: { "Content-Type": asset.type, "X-Content-Type-Options": "nosniff" },
        });
      }
      if (!env.DB) return send(htmlResponse(noticePage("资料库暂不可用", "请稍后再试。"), 503));
      if (["/admin", "/admin/analytics", "/admin/contact"].includes(url.pathname)) return await handleAdmin(request, url, env);
      if (url.pathname === "/admin/login") return await adminLogin(request, url, env);
      if (url.pathname === "/admin/account") return await adminAccount(request, url, env);
      if (url.pathname === "/admin/logout") return await adminLogout(request, url, env);
      const resourceAction = url.pathname.match(/^\/([a-z0-9]{4,10})\/(open|report)$/);
      if (resourceAction) return await handleResourceAction(request, url, env.DB, resourceAction[1], resourceAction[2]);
      if (!read) return methodNotAllowed("GET, HEAD");
      if (url.pathname === "/") {
        const [resources, contact] = await Promise.all([
          listResources(env.DB),
          env.CONTACT?.head(contactKey).catch(() => null),
        ]);
        return send(htmlResponse(catalogPage(resources, catalogState(url.searchParams), contact?.customMetadata?.published === "1")));
      }
      if (url.pathname === "/contact") {
        const { contact } = await readContact(env.CONTACT);
        return send(hasContact(contact)
          ? htmlResponse(contactPage(contact), 200, "'self'", true)
          : htmlResponse(noticePage("联系站长", "站长尚未公开联系方式。"), 404));
      }
      const code = url.pathname.slice(1);
      if (!validCode.test(code)) return send(notFound());
      const prefetch = [request.headers.get("Purpose"), request.headers.get("Sec-Purpose")]
        .some(value => value?.includes("prefetch"));
      const reported = url.searchParams.get("reported") === "1";
      const resourceFormTargets = "'self' https://pan.quark.cn";
      if (head || prefetch || reported) {
        const item = await env.DB.prepare("SELECT * FROM resources WHERE code = ? AND trashed = 0").bind(code).first();
        return send(item ? htmlResponse(detailPage(item, reported), 200, resourceFormTargets) : notFound());
      }
      const { item, cookie } = await recordActivity(request, env.DB, code, false);
      if (!item) return notFound();
      const response = htmlResponse(detailPage(item), 200, resourceFormTargets);
      if (cookie) response.headers.set("Set-Cookie", cookie);
      return response;
    } catch (error) {
      console.error("Resource catalog request failed:", error.message);
      return send(htmlResponse(noticePage("资料库暂不可用", "请稍后再试。"), 503));
    }
  },
};
