const statusMessage = document.getElementById("copy-status");
let statusTimer;

function showStatus(message, persistent = false) {
  if (!statusMessage) return;
  clearTimeout(statusTimer);
  statusMessage.textContent = message;
  if (!persistent && statusMessage.classList.contains("site-toast")) {
    statusTimer = setTimeout(() => { statusMessage.textContent = ""; }, 2600);
  }
}

function readCodes(section) {
  try {
    const codes = JSON.parse(localStorage.getItem("quark-catalog:" + section));
    return Array.isArray(codes) ? codes : [];
  } catch {
    return [];
  }
}

function saveCodes(section, codes) {
  try {
    localStorage.setItem("quark-catalog:" + section, JSON.stringify(codes));
    return true;
  } catch {
    return false;
  }
}

function remember(section, code) {
  return saveCodes(section, [code, ...readCodes(section).filter(item => item !== code)]);
}

const detail = document.querySelector("[data-resource]");
if (detail) remember("recent", detail.dataset.resource);

const collection = document.querySelector("[data-section]");
const resultCount = document.querySelector("[data-result-count]");
const savedFavorites = readCodes("favorites");
document.querySelectorAll("[data-favorite]").forEach(favorite => {
  const code = favorite.dataset.favorite || detail?.dataset.resource;
  if (!code) return;
  const inCatalog = Boolean(favorite.dataset.favorite);

  function showFavorite(selected) {
    favorite.setAttribute("aria-pressed", String(selected));
    favorite.textContent = inCatalog
      ? (selected ? "★ 已收藏" : "☆ 收藏")
      : (selected ? "取消收藏" : "收藏资料");
  }

  showFavorite(savedFavorites.includes(code));
  favorite.addEventListener("click", () => {
    const codes = readCodes("favorites");
    const selected = codes.includes(code);
    const updated = selected ? codes.filter(item => item !== code) : [code, ...codes];
    if (saveCodes("favorites", updated)) {
      showFavorite(!selected);
      showStatus(selected ? "已取消收藏。" : "已收藏，可在「我的收藏」查看。");
      if (selected && collection?.dataset.section === "favorites") {
        favorite.closest("[data-code]").hidden = true;
        const next = collection.querySelector("[data-code]:not([hidden]) [data-favorite]");
        document.getElementById("empty-results").hidden = Boolean(next);
        if (resultCount) resultCount.textContent = collection.querySelectorAll("[data-code]:not([hidden])").length;
        (next || document.querySelector(".personal [aria-current=page]"))?.focus();
      }
    } else {
      showStatus("浏览器未允许保存收藏。");
    }
  });
});

if (collection?.dataset.section) {
  const section = collection.dataset.section;
  const rows = new Map(Array.from(collection.querySelectorAll("[data-code]"),
    row => [row.dataset.code, row]));
  const list = collection.querySelector(".rows");
  const codes = readCodes(section).filter(code => rows.has(code));
  const sortedByViews = new URLSearchParams(location.search).get("sort") === "views";
  for (const code of codes) {
    const row = rows.get(code);
    row.hidden = false;
    if (!sortedByViews) list.append(row);
  }
  document.getElementById("empty-results").hidden = codes.length > 0;
  if (resultCount) resultCount.textContent = codes.length;
}

document.querySelectorAll("[data-copy]").forEach(button => {
  button.addEventListener("click", async () => {
    const type = button.dataset.copy;
    const shareUrl = new URL(button.dataset.path || location.pathname, location.origin);
    const copyField = document.getElementById(type === "wechat" ? "wechat-id" : "quark-link");
    const text = {
      share: shareUrl.href,
      post: document.title + "\n🔗 " + shareUrl.href,
      link: copyField?.value,
      wechat: copyField?.value,
    }[type];
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      if (type === "link" || type === "wechat") {
        copyField.select();
        showStatus(`浏览器未允许复制，请手动复制选中的${type === "link" ? "链接" : "微信号"}。`, true);
      } else {
        showStatus("请手动复制分享链接 " + shareUrl.href, true);
      }
      return;
    }
    showStatus({
      share: "已复制本站短链。",
      post: "已复制 X 发帖文案和本站短链。",
      link: "已复制夸克链接。",
      wechat: "已复制微信号。",
    }[type]);
  });
});
