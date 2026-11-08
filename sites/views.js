const siteName = "夸克资料库";
const sections = new Map([
  ["", "全部资源"], ["favorites", "我的收藏"], ["recent", "最近访问"],
]);
const cloudIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6.5 19a4.5 4.5 0 0 1-.7-8.95 6.2 6.2 0 0 1 12.13 1.32A3.84 3.84 0 0 1 18.4 19z"/></svg>';
const formatNumber = new Intl.NumberFormat("zh-CN");

function html(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function sitePage(title, body, {
  search = "",
  description = "搜索夸克网盘分享资料，浏览、收藏并复制资料短链。",
  showHeader = true,
  noindex = false,
} = {}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${html(description)}">
  ${noindex ? '<meta name="robots" content="noindex">' : ""}
  <meta property="og:title" content="${html(title)}">
  <meta property="og:description" content="${html(description)}">
  <meta property="og:site_name" content="${siteName}">
  <title>${html(title)}</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/style.css">
  <script src="/catalog.js" defer></script>
</head>
<body>
  ${showHeader ? `<header class="top"><div class="wrap top-inner">
    <a class="brand" href="/"><span class="mark">${cloudIcon}</span>${siteName}</a>
    ${search}
    <nav class="top-nav" aria-label="网站导航"><a href="/">首页</a><a href="/admin/login">管理</a></nav>
  </div></header>` : ""}
  ${body}
</body>
</html>`;
}

function resourceMeta(item) {
  return `<p class="meta"><span class="views">${formatNumber.format(item.views)} 次浏览</span>
    <time datetime="${html(item.added)}">${html(item.added)}</time><span class="code">${html(item.code)}</span></p>`;
}

function catalogPage(resources, state, showContact = false) {
  const { q, section, layout, sort } = state;

  function catalogLink(label, current, changes, count) {
    const params = new URLSearchParams(Object.entries({ ...state, page: "", ...changes }).filter(([, value]) => value));
    const href = params.size ? "/?" + params : "/";
    return `<a href="${html(href)}"${current ? ' aria-current="page"' : ""}>${html(label)}${count === undefined ? "" : `<span>${count}</span>`}</a>`;
  }

  const allResources = catalogLink("全部资源", !section, { section: "" }, resources.length);
  const personal = [...sections].slice(1).map(([key, label]) =>
    catalogLink(label, section === key, { section: key })).join("");
  const hiddenFields = Object.entries(state).filter(([key, value]) => key !== "q" && key !== "page" && value)
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${html(value)}">`).join("");
  const search = `<form class="search" action="/" role="search">
    ${hiddenFields}
    <input type="search" name="q" placeholder="搜索分享资源" aria-label="搜索分享资源" value="${html(q)}">
    <button type="submit">搜索</button>
  </form>`;
  const needle = q.toLowerCase();
  const results = resources.filter(item =>
    `${item.title} ${item.description} ${item.code}`.toLowerCase().includes(needle));
  if (sort === "views") results.sort((left, right) => right.views - left.views);
  const pageSize = 20;
  const pages = section ? 1 : Math.max(1, Math.ceil(results.length / pageSize));
  const page = Math.min(Number(state.page) || 1, pages);
  const visible = section ? results : results.slice((page - 1) * pageSize, page * pageSize);
  const rows = visible.map(item => `<li class="row" data-code="${html(item.code)}"${section ? " hidden" : ""}>
    <span class="folder">${cloudIcon}</span>
    <div class="row-copy"><h2><a href="/${html(item.code)}">${html(item.title)}</a></h2>${resourceMeta(item)}</div>
    <div class="row-actions">
      <button class="button button-quiet button-favorite" data-favorite="${html(item.code)}" type="button" aria-label="收藏 ${html(item.title)}" aria-pressed="false">☆ 收藏</button>
      <button class="button button-quiet" data-copy="share" data-path="/${html(item.code)}" type="button" aria-label="复制 ${html(item.title)} 的分享短链">复制分享短链</button>
      <a class="button button-visit" href="/${html(item.code)}" aria-label="获取 ${html(item.title)}">获取资料</a>
    </div>
  </li>`).join("");
  const empty = new Map([
    ["favorites", "这里还没有匹配的收藏。可以在「全部资源」中点击资料旁的「收藏」。"],
    ["recent", "这里还没有匹配的访问记录。"],
  ]).get(section) ?? (resources.length ? "没有找到匹配的资料，换个关键词试试。" : "这里还没有发布资料。");
  return sitePage(siteName, `<main class="wrap catalog">
    <section class="intro">
      <div class="intro-copy"><h1>分享资源中心</h1><p>查找夸克网盘资料，打开或分享给朋友。</p></div>
      <dl class="stats">
        <div><dt>资源总数</dt><dd>${formatNumber.format(resources.length)}</dd></div>
        <div><dt>总浏览次数</dt><dd>${formatNumber.format(resources.reduce((total, item) => total + item.views, 0))}</dd></div>
      </dl>
    </section>
    <div class="catalog-body">
      <aside class="sidebar">
        <h2>资源导航</h2>
        <nav class="filters" aria-label="资源导航">${allResources}</nav>
        <nav class="filters personal" aria-label="个人记录">${personal}</nav>
        ${showContact ? '<nav class="filters personal" aria-label="联系方式"><a href="/contact">联系站长</a></nav>' : ""}
      </aside>
      <section class="collection" aria-label="资源列表" data-section="${html(section)}">
        <div class="toolbar">
          <h2>${html(sections.get(section))}</h2>
          <div class="catalog-controls">
            <nav class="view-options" aria-label="资源排序">
              ${catalogLink(section === "recent" ? "最近打开" : section === "favorites" ? "最近收藏" : "最新添加", !sort, { sort: "" })}
              ${catalogLink("最多浏览", Boolean(sort), { sort: "views" })}
            </nav>
            <nav class="view-options" aria-label="资源显示方式">
              ${catalogLink("列表", !layout, { layout: "" })}
              ${catalogLink("网格", Boolean(layout), { layout: "grid" })}
            </nav>
          </div>
        </div>
        ${q ? `<p class="search-summary">找到 <span data-result-count>${section ? 0 : results.length}</span> 条资料 ${catalogLink("清除搜索", false, { q: "" })}</p>` : ""}
        <p id="copy-status" class="site-toast" role="status"></p>
        <ul class="rows${layout ? " rows-grid" : ""}">${rows}</ul>
        <p class="empty" id="empty-results"${results.length && !section ? " hidden" : ""}>${empty}</p>
        ${pages > 1 ? `<nav class="catalog-pages" aria-label="资源分页">
          ${page > 1 ? catalogLink("上一页", false, { page: String(page - 1) }) : ""}
          <span>第 ${page} / ${pages} 页</span>
          ${page < pages ? catalogLink("下一页", false, { page: String(page + 1) }) : ""}
        </nav>` : ""}
      </section>
    </div>
  </main>`, { search });
}

function detailPage(item, reported = false) {
  return sitePage(item.title, `<main class="detail" data-resource="${html(item.code)}">
    <article class="resource">
      <div class="resource-info">
        <h1 class="resource-heading">打开资源</h1>
        <p class="resource-instructions">点击按钮打开夸克网盘。若未打开，请复制链接到浏览器自行打开。</p>
        <form action="/${html(item.code)}/open" method="post">
          <button class="button button-primary" type="submit">打开夸克网盘 <span aria-hidden="true">↗</span></button>
        </form>
        <a class="button button-quiet button-catalog" href="/">浏览全部资料 <span aria-hidden="true">→</span></a>
      </div>
      <div class="link-panel">
        <label for="quark-link">夸克链接</label>
        <div class="link-row">
          <input id="quark-link" readonly value="${html(item.url)}">
          <button class="button button-quiet" data-copy="link" type="button">复制夸克链接</button>
        </div>
        <p class="clipboard-hint">打开夸克后会自动识别剪贴板中的链接并跳转。</p>
        <p id="copy-status" class="site-toast" role="status"></p>
        ${reported ? '<p class="report-feedback" role="status">已收到反馈，谢谢。</p>' : `<form class="report-form" action="/${html(item.code)}/report" method="post">
          <input type="hidden" name="url" value="${html(item.url)}">
          <button class="button button-share" type="submit">反馈链接失效</button>
        </form>`}
      </div>
    </article>
  </main>`, { description: item.description || `打开「${item.title}」的夸克网盘分享链接。` });
}

function bulkPanel(bulk) {
  const rows = bulk?.rows || [];
  const valid = rows.filter(item => !item.error).length;
  return `<details class="bulk-panel"${bulk ? " open" : ""}>
    <summary>批量录入</summary>
    <form class="admin-form resource-form" action="/admin" method="post">
      <label>每行一条，标题和夸克链接用空格或制表符分隔。每次最多 20 条。
        <textarea name="bulk" rows="5" maxlength="12500" required placeholder="资料标题 https://pan.quark.cn/s/…">${html(bulk?.input || "")}</textarea>
      </label>
      <div class="admin-actions"><button class="button button-quiet" type="submit" name="action" value="preview-bulk">预览</button></div>
    </form>
    ${bulk?.error ? `<p class="feedback" role="alert">${html(bulk.error)}</p>` : ""}
    ${rows.length ? `<div class="bulk-review">
      <p>可导入 ${valid} 条，跳过 ${rows.length - valid} 条。</p>
      <ol>${rows.map(item => `<li><strong>${html(item.title)}</strong> · ${html(item.error || "可导入")}${item.url ? `<small>${html(item.url)}</small>` : ""}</li>`).join("")}</ol>
      ${valid ? `<form action="/admin" method="post">
        <input type="hidden" name="bulk" value="${html(bulk.input)}">
        <button class="button button-visit" type="submit" name="action" value="save-bulk">确认导入</button>
      </form>` : ""}
    </div>` : ""}
  </details>`;
}

function adminNavigation(active) {
  const links = [["/admin", "资料管理"], ["/admin/analytics", "数据分析"], ["/admin/contact", "联系方式"], ["/admin?recycle=1", "回收站"]];
  return `<nav class="view-options admin-navigation" aria-label="管理导航">
    ${links.map(([href, label]) => `<a href="${href}"${active === href ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
    <form action="/admin/logout" method="post"><button class="button button-quiet" type="submit">退出登录</button></form>
  </nav>`;
}

function contactPage(contact) {
  const resource = contact.resourceQr ? `<article class="contact-card">
    <h2>资源网盘微信</h2>
    <img class="contact-qr" src="${html(contact.resourceQr)}" alt="资源网盘微信二维码">
    <p>用微信扫一扫</p>
  </article>` : "";
  const personal = contact.wechatId || contact.personalQr ? `<article class="contact-card">
    <h2>个人微信</h2>
    ${contact.personalQr ? `<img class="contact-qr" src="${html(contact.personalQr)}" alt="个人微信二维码"><p>用微信扫一扫</p>` : ""}
    ${contact.wechatId ? `<label for="wechat-id">微信号</label>
      <div class="link-row"><input id="wechat-id" readonly value="${html(contact.wechatId)}">
      <button class="button button-quiet" type="button" data-copy="wechat">复制微信号</button></div>` : ""}
  </article>` : "";
  return sitePage("联系站长", `<main class="wrap catalog contact-page">
    <a class="back" href="/">← 返回资料首页</a>
    <section class="collection">
      <div class="toolbar"><h1>联系站长</h1></div>
      <div class="contact-grid">${resource}${personal}</div>
      <p id="copy-status" class="site-toast" role="status"></p>
    </section>
  </main>`, { description: "查看夸克资料库站长公开的微信联系方式。" });
}

function contactAdminPage(contact, revision, { error = "", saved = false, wechatId = contact.wechatId || "" } = {}) {
  function qrField(label, name, removeName) {
    return `<fieldset class="contact-field">
      <legend>${label}</legend>
      ${contact[name] ? `<img class="contact-qr" src="${html(contact[name])}" alt="当前${label}">
      <label class="contact-remove"><input type="checkbox" name="${removeName}"> 移除当前图片</label>` : ""}
      <label for="${name}">${contact[name] ? "更换图片" : "上传图片"}</label>
      <input id="${name}" name="${name}" type="file" accept="image/png,image/jpeg,image/webp">
    </fieldset>`;
  }
  return sitePage("联系方式", `<main class="wrap catalog">
    <section class="collection">
      <div class="toolbar"><h1>联系方式</h1>${adminNavigation("/admin/contact")}</div>
      ${error ? `<p class="feedback" role="alert">${html(error)}</p>` : ""}
      ${saved ? '<p class="feedback" role="status">联系方式已更新。</p>' : ""}
      <form class="contact-admin" action="/admin/contact" method="post" enctype="multipart/form-data">
        <input type="hidden" name="revision" value="${html(revision)}">
        <p>保存后，访客可以在「联系站长」页面看到你填写的内容。每张图片最多 512 KB，支持 PNG、JPG 和 WebP。</p>
        <div class="contact-grid">
          ${qrField("资源网盘微信二维码", "resourceQr", "removeResourceQr")}
          ${qrField("个人微信二维码", "personalQr", "removePersonalQr")}
        </div>
        <label class="contact-id">个人微信号<input name="wechatId" maxlength="40" value="${html(wechatId)}" autocomplete="off" placeholder="可选"></label>
        <div class="admin-actions">
          <button class="button button-visit" type="submit">保存联系方式</button>
          ${hasContact(contact) ? '<a class="button button-quiet" href="/contact">查看公开页面</a>' : ""}
        </div>
      </form>
    </section>
  </main>`, { noindex: true });
}

function adminPage(resources, { recycle = false, draft, error = "", saved, notice = "", bulk } = {}) {
  const item = draft || {};
  const editing = Boolean(item.code);
  const form = recycle ? "" : `<form class="admin-form resource-form" action="/admin" method="post">
    <h2>${editing ? "编辑资料" : "添加资料"}</h2>
    <input type="hidden" name="action" value="save">
    <input type="hidden" name="code" value="${html(item.code || "")}">
    <label>资料标题<input name="title" maxlength="120" value="${html(item.title || "")}" required></label>
    <label>夸克分享链接<input name="url" type="url" maxlength="500" value="${html(item.url || "")}" placeholder="https://pan.quark.cn/s/…" required></label>
    <div class="admin-actions">
      <button class="button button-visit" type="submit">保存资料</button>
      ${editing ? '<a class="button button-quiet" href="/admin">取消编辑</a>' : ""}
    </div>
  </form>`;
  const rows = resources.map(resource => `<li class="row">
    <span class="folder">${cloudIcon}</span>
    <div><h2>${html(resource.title)}</h2>${resourceMeta(resource)}
      <p class="meta">${formatNumber.format(resource.quark_clicks)} 次夸克点击</p>
      ${resource.link_reported ? '<p class="meta report-flag">收到链接失效反馈</p>' : ""}
    </div>
    <div class="row-actions">
      ${recycle ? "" : `<a class="button button-quiet" href="/admin?edit=${html(resource.code)}">编辑</a>`}
      ${recycle ? "" : `<button class="button button-quiet" type="button" data-copy="share" data-path="/${html(resource.code)}">复制分享短链</button>`}
      ${!recycle && resource.link_reported ? `<form action="/admin" method="post">
        <input type="hidden" name="code" value="${html(resource.code)}">
        <button class="button button-quiet" type="submit" name="action" value="dismiss-report">标记已处理</button>
      </form>` : ""}
      <form action="/admin" method="post">
        <input type="hidden" name="action" value="${recycle ? "restore" : "trash"}">
        <input type="hidden" name="code" value="${html(resource.code)}">
        <button class="button button-quiet" type="submit">${recycle ? "恢复" : "移入回收站"}</button>
      </form>
    </div>
  </li>`).join("");
  return sitePage("管理资料", `<main class="wrap catalog">
    <section class="collection" aria-label="管理资料">
      <div class="toolbar">
        <h1>管理资料</h1>
        ${adminNavigation(recycle ? "/admin?recycle=1" : "/admin")}
      </div>
      ${error ? `<p class="feedback" role="alert">${html(error)}</p>` : ""}
      ${notice ? `<p class="feedback" role="status">${html(notice)}</p>` : ""}
      ${saved ? `<div class="admin-saved"><p role="status">已保存「${html(saved.title)}」</p>
        <button class="button button-quiet" type="button" data-copy="share" data-path="/${html(saved.code)}">复制分享短链</button>
      </div>` : ""}
      <p id="copy-status" class="site-toast" role="status"></p>
      ${form}${recycle ? "" : bulkPanel(bulk)}<ul class="rows">${rows}</ul>${rows ? "" : '<p class="empty">暂无资料。</p>'}
    </section>
  </main>`, { noindex: true });
}

function analyticsPage({ days, summary, trend, ranking, lifetime }) {
  const number = value => formatNumber.format(value);
  const rate = summary.view_visitors ? (summary.converted_visitors / summary.view_visitors * 100).toFixed(1) + "%" : "—";
  const metrics = [
    ["浏览人数", number(summary.view_visitors), `${number(summary.views)} 次资料页浏览`],
    ["夸克点击人数", number(summary.click_visitors), `${number(summary.clicks)} 次打开夸克点击`],
    ["浏览后点击比例", rate, `${number(summary.converted_visitors)} 位访客既浏览又点击`],
  ];
  const max = Math.max(1, ...trend.map(item => Math.max(item.views, item.clicks)));
  const coordinates = key => trend.map((item, index) =>
    `${(20 + index * 760 / (trend.length - 1)).toFixed(1)},${(146 - item[key] * 126 / max).toFixed(1)}`).join(" ");
  const trendTable = trend.map(item => `<tr><th scope="row">${html(item.day)}</th><td>${number(item.views)}</td><td>${number(item.clicks)}</td></tr>`).join("");
  const ranks = ranking.map((item, index) => `<tr>
    <td>${index + 1}</td><th scope="row">${item.trashed ? html(item.title) + ' <small>已下架</small>' : `<a href="/admin?edit=${html(item.code)}">${html(item.title)}</a>`}</th>
    <td>${number(item.view_visitors)}</td><td>${number(item.views)}</td>
    <td>${number(item.click_visitors)}</td><td>${number(item.clicks)}</td>
  </tr>`).join("");
  return sitePage("数据分析", `<main class="wrap catalog">
    <section class="collection" aria-labelledby="analytics-title">
      <div class="toolbar"><h1 id="analytics-title">数据分析</h1>${adminNavigation("/admin/analytics")}</div>
      <div class="analytics-body">
        <div class="analytics-period">
          <p>北京时间 · ${html(trend[0].day)} 至 ${html(trend.at(-1).day)}</p>
          <nav class="view-options" aria-label="统计范围">
            ${[7, 30].map(period => `<a href="/admin/analytics?days=${period}"${period === days ? ' aria-current="page"' : ""}>近 ${period} 天</a>`).join("")}
          </nav>
        </div>
        <dl class="analytics-metrics">${metrics.map(([label, value, note]) => `<div><dt>${label}</dt><dd><strong>${value}</strong><span>${note}</span></dd></div>`).join("")}</dl>
        <p class="analytics-note">人数按浏览器去重，自统计上线起记录。累计浏览 ${number(lifetime.views)} 次，累计夸克点击 ${number(lifetime.clicks)} 次。</p>
        <section class="analytics-panel" aria-labelledby="trend-title">
          <h2 id="trend-title">每日访问趋势</h2>
          ${summary.views || summary.clicks ? `<p class="analytics-legend"><span>资料页浏览次数</span><span>夸克点击次数</span></p>
          <svg class="analytics-chart" viewBox="0 0 800 166" role="img" aria-label="资料页浏览次数与夸克点击次数趋势">
            <path class="analytics-axis" d="M20 20V146H780M20 83H780"/>
            <polyline class="analytics-views" points="${coordinates("views")}"/>
            <polyline class="analytics-clicks" points="${coordinates("clicks")}"/>
          </svg>
          <p class="analytics-dates"><span>${html(trend[0].day)}</span><span>${html(trend.at(-1).day)}</span></p>` : '<p class="analytics-note">这个时间段还没有访问记录。</p>'}
          <details class="analytics-details"><summary>查看每日数据</summary>
            <div class="analytics-table-wrap"><table><thead><tr><th scope="col">日期</th><th scope="col">浏览次数</th><th scope="col">夸克点击次数</th></tr></thead><tbody>${trendTable}</tbody></table></div>
          </details>
        </section>
        <section class="analytics-panel" aria-labelledby="ranking-title">
          <h2 id="ranking-title">热门资料排行</h2>
          <p class="analytics-note">按夸克点击次数排序，点击次数相同时按浏览次数排序。</p>
          ${ranks ? `<div class="analytics-table-wrap"><table>
            <thead><tr><th scope="col">排名</th><th scope="col">资料</th><th scope="col">浏览人数</th><th scope="col">浏览次数</th><th scope="col">点击人数</th><th scope="col">夸克点击次数</th></tr></thead>
            <tbody>${ranks}</tbody>
          </table></div>` : '<p class="analytics-note">有访问记录后会显示热门资料。</p>'}
        </section>
      </div>
    </section>
  </main>`, { noindex: true });
}

function loginLayout(title, caption, controls) {
  return sitePage(title, `<main class="login-layout">
    <aside class="login-hero">
      <a class="login-brand" href="/"><span class="mark">${cloudIcon}</span>夸克网盘管理系统</a>
      <div class="login-intro">
        <p class="login-headline">简单高效的<br>网盘链接管理</p>
        <p>统一管理夸克网盘分享链接，<br>查看浏览次数，生成资料短链。</p>
      </div>
    </aside>
    <section class="login-side" aria-labelledby="login-title">
      <div class="login-panel">
        <h1 id="login-title">${html(title)}</h1>
        <p class="login-caption">${html(caption)}</p>
        ${controls}
        <a class="login-back" href="/">← 返回前台首页</a>
      </div>
    </section>
  </main>`, { description: caption, showHeader: false, noindex: true });
}

function loginPage({ email = "", notice = "", error = "", active = false } = {}) {
  return loginLayout("账号登录", "请使用管理员账号登录", `
    ${notice ? `<p class="login-message" role="status">${html(notice)}</p>` : ""}
    ${error ? `<p class="login-message login-error" role="alert">${html(error)}</p>` : ""}
    ${active ? '<a class="login-current" href="/admin">已登录，进入管理后台 →</a>' : ""}
    <form class="login-form" action="/admin/login" method="post">
      <label>账号<input name="email" type="email" autocomplete="username" maxlength="254" value="${html(email)}" placeholder="请输入管理员邮箱" required></label>
      <label>密码<input name="password" type="password" autocomplete="current-password" maxlength="128" placeholder="请输入网站管理密码" required></label>
      <div class="login-options">
        <label><input name="remember" type="checkbox" value="1">记住登录</label>
        <a href="/admin/account">忘记密码？</a>
      </div>
      <button class="login-submit" type="submit">登 录</button>
    </form>
    <p class="login-first">首次使用？<a href="/admin/account">设置网站管理密码</a></p>`);
}

function accountPage({ verify = "", error = "", requiresToken = false, unavailable = false } = {}) {
  let controls = "";
  if (verify) {
    controls = '<a class="login-submit" href="/signin-with-chatgpt?return_to=%2Fadmin%2Faccount" target="_top">使用 ChatGPT 验证</a>';
  } else if (!unavailable) {
    controls = `${error ? `<p class="login-message login-error" role="alert">${html(error)}</p>` : ""}
      <form class="login-form" action="/admin/account" method="post">
        ${requiresToken ? '<label>设置密钥<input name="setupToken" type="password" autocomplete="off" maxlength="128" required></label>' : ""}
        <label>新密码<input name="password" type="password" autocomplete="new-password" minlength="14" maxlength="128" required></label>
        <label>确认密码<input name="confirm" type="password" autocomplete="new-password" minlength="14" maxlength="128" required></label>
        <button class="login-submit" type="submit">保存管理密码</button>
      </form>`;
  }
  const caption = unavailable ? "站长尚未启用密码设置。" : verify || "为本站设置独立密码，至少 14 个字符。";
  return loginLayout("设置网站管理密码", caption,
    controls + '<a class="login-current" href="/admin/login">返回账号登录</a>');
}

function noticePage(title, text, action = '<a class="back" href="/">← 返回全部资料</a>') {
  return sitePage(title, `<main class="detail"><article class="resource"><div class="resource-info">
    <h1>${html(title)}</h1><p>${html(text)}</p>${action}
  </div></article></main>`, { noindex: true });
}
