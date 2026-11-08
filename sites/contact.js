const contactKey = "public-contact.json";
const qrLimit = 512 * 1024;

function hasContact(contact) {
  return Boolean(contact.resourceQr || contact.personalQr || contact.wechatId);
}

async function readContact(bucket) {
  const object = await bucket?.get(contactKey);
  return object ? { object, contact: await object.json() } : { object: null, contact: {} };
}

async function readQr(file, label) {
  if (!(file instanceof File) || !file.size) return {};
  if (file.size > qrLimit) return { error: `${label}的二维码图片不能超过 512 KB。` };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = hex(bytes.subarray(0, 12));
  let type;
  if (signature.startsWith("89504e470d0a1a0a")) type = "image/png";
  else if (signature.startsWith("ffd8ff")) type = "image/jpeg";
  else if (signature.startsWith("52494646") && signature.endsWith("57454250")) type = "image/webp";
  else return { error: `${label}请上传 PNG、JPG 或 WebP 图片。` };

  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return { image: `data:${type};base64,${btoa(binary)}` };
}

async function handleContactAdmin(request, url, bucket) {
  if (!bucket) return htmlResponse(noticePage("联系方式暂不可用", "图片存储尚未配置。"), 503);
  if (request.method !== "GET" && request.method !== "POST") return methodNotAllowed("GET, POST");
  const { contact, object } = await readContact(bucket);
  const revision = object?.etag || "";
  const render = (options, status = 200) =>
    htmlResponse(contactAdminPage(contact, revision, options), status, "'self'", true);
  if (request.method === "GET") return render({ saved: url.searchParams.get("saved") === "1" });

  if (request.headers.get("Origin") !== url.origin) return new Response(null, { status: 403 });
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data;")) return new Response(null, { status: 415 });
  if (Number(request.headers.get("Content-Length")) > 2 * qrLimit + 8192) {
    return render({ error: "上传内容太大，每张二维码图片最多 512 KB。" }, 413);
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return render({ error: "无法读取上传内容，请重新选择图片。" }, 400);
  }
  const changed = "联系方式已在另一个页面更新，请按当前内容重新填写。";
  if (form.get("revision") !== revision) return render({ error: changed }, 409);
  const wechatId = String(form.get("wechatId") || "").trim();
  if (wechatId && !/^[a-zA-Z0-9_-]{1,40}$/.test(wechatId)) {
    return render({ error: "微信号可填写字母、数字、下划线或连字符，最多 40 个字符。", wechatId }, 422);
  }
  const [resource, personal] = await Promise.all([
    readQr(form.get("resourceQr"), "资源网盘微信"),
    readQr(form.get("personalQr"), "个人微信"),
  ]);
  const error = resource.error || personal.error;
  if (error) return render({ error, wechatId }, 422);

  const updated = {
    wechatId,
    resourceQr: resource.image || (form.has("removeResourceQr") ? "" : contact.resourceQr || ""),
    personalQr: personal.image || (form.has("removePersonalQr") ? "" : contact.personalQr || ""),
  };
  const condition = object ? { "If-Match": object.httpEtag } : { "If-None-Match": "*" };
  const saved = await bucket.put(contactKey, JSON.stringify(updated), {
    onlyIf: new Headers(condition),
    httpMetadata: { contentType: "application/json" },
    customMetadata: { published: hasContact(updated) ? "1" : "0" },
  });
  if (!saved) return htmlResponse(noticePage("保存冲突", changed, '<a class="back" href="/admin/contact">← 返回联系方式</a>'), 409);
  return adminRedirect("/admin/contact?saved=1");
}
