const visitorCookie = "__Host-quark-visitor";

async function recordActivity(request, db, code, openedQuark) {
  const existing = request.headers.get("Cookie")?.match(/(?:^|;\s*)__Host-quark-visitor=([a-f0-9]{64})(?=;|$)/)?.[1];
  const token = existing || hex(crypto.getRandomValues(new Uint8Array(32)));
  const visitor = await sha256(token);
  const day = dateFormatter.format(new Date());
  const views = openedQuark ? 0 : 1;
  const clicks = openedQuark ? 1 : 0;
  const [result] = await db.batch([
    db.prepare(`UPDATE resources SET views = views + ?, quark_clicks = quark_clicks + ?
      WHERE code = ? AND trashed = 0 RETURNING *`).bind(views, clicks, code),
    db.prepare(`INSERT INTO resource_daily_activity (day, code, visitor, views, clicks)
      SELECT ?, code, ?, ?, ? FROM resources WHERE code = ? AND trashed = 0
      ON CONFLICT (day, code, visitor) DO UPDATE SET views = views + excluded.views, clicks = clicks + excluded.clicks`)
      .bind(day, visitor, views, clicks, code),
  ]);
  const item = result.results[0];
  const cookie = item && !existing
    ? `${visitorCookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=15552000`
    : "";
  return { item, cookie };
}

async function resourceAnalytics(db, days) {
  const today = dateFormatter.format(new Date());
  const dates = Array.from({ length: days }, (_, index) =>
    new Date(Date.parse(today) - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10));
  const from = dates[0];
  const [summary, daily, ranking, lifetime] = await db.batch([
    db.prepare(`SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(clicks), 0) AS clicks,
      COUNT(CASE WHEN views > 0 THEN 1 END) AS view_visitors,
      COUNT(CASE WHEN clicks > 0 THEN 1 END) AS click_visitors,
      COUNT(CASE WHEN views > 0 AND clicks > 0 THEN 1 END) AS converted_visitors
      FROM (SELECT SUM(views) AS views, SUM(clicks) AS clicks FROM resource_daily_activity
        WHERE day BETWEEN ? AND ? GROUP BY visitor)`).bind(from, today),
    db.prepare(`SELECT day, SUM(views) AS views, SUM(clicks) AS clicks FROM resource_daily_activity
      WHERE day BETWEEN ? AND ? GROUP BY day`).bind(from, today),
    db.prepare(`SELECT r.title, r.code, r.trashed, SUM(a.views) AS views, SUM(a.clicks) AS clicks,
      COUNT(DISTINCT CASE WHEN a.views > 0 THEN a.visitor END) AS view_visitors,
      COUNT(DISTINCT CASE WHEN a.clicks > 0 THEN a.visitor END) AS click_visitors
      FROM resource_daily_activity a JOIN resources r ON r.code = a.code
      WHERE a.day BETWEEN ? AND ? GROUP BY r.code
      ORDER BY clicks DESC, views DESC, r.code LIMIT 10`).bind(from, today),
    db.prepare(`SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(quark_clicks), 0) AS clicks
      FROM resources`),
  ]);
  const byDay = new Map(daily.results.map(item => [item.day, item]));
  return {
    days,
    summary: summary.results[0],
    trend: dates.map(day => byDay.get(day) || { day, views: 0, clicks: 0 }),
    ranking: ranking.results,
    lifetime: lifetime.results[0],
  };
}
