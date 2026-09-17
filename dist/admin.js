(() => {
  "use strict";

  const OWNER = "huzhibinnnn-coder";
  const REPO = "huzhibinnnn-coder.github.io";
  const BRANCH = "main";
  const DATA_PATH = "dist/data/portfolio.json";
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const API_ROOT = "https://api.github.com";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const state = {
    token: "",
    data: null,
    dataSha: "",
    selectedId: "",
    pending: new Map(),
    dirty: false,
    toastTimer: 0,
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindLogin();
    bindNavigation();
    bindProfileEditor();
    bindThemeEditor();
    bindWorkEditor();
    $("#publish-button").addEventListener("click", publishAll);
    $("#logout-button").addEventListener("click", logout);
    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
    window.addEventListener("pagehide", () => { state.token = ""; });
  }

  function bindLogin() {
    $("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.submitter;
      const error = $("#login-error");
      const token = $("#token-input").value.trim();
      error.textContent = "";
      if (!token) return;
      button.disabled = true;
      button.textContent = "正在验证…";
      state.token = token;
      try {
        const [user, repository] = await Promise.all([
          github("/user"),
          github(`/repos/${OWNER}/${REPO}`),
        ]);
        if (String(user.login).toLowerCase() !== OWNER.toLowerCase()) throw new Error("该密钥不属于网站所有者账号。请使用你自己的 GitHub 账号密钥。");
        if (!(repository.permissions?.push || repository.permissions?.admin || repository.permissions?.maintain)) throw new Error("当前 GitHub 账号没有此仓库的写入权限。");
        await verifyTokenWriteAccess();
        await loadRepositoryData();
        openEditor(user.login);
      } catch (caught) {
        state.token = "";
        error.textContent = friendlyError(caught);
      } finally {
        $("#token-input").value = "";
        button.disabled = false;
        button.textContent = "验证并进入";
      }
    });
  }

  async function loadRepositoryData() {
    const file = await github(`/repos/${OWNER}/${REPO}/contents/${encodePath(DATA_PATH)}?ref=${encodeURIComponent(BRANCH)}`);
    if (!file.content) throw new Error("无法读取作品集数据文件。");
    state.data = normalizeData(JSON.parse(decodeBase64(file.content)));
    state.dataSha = file.sha;
  }

  async function verifyTokenWriteAccess() {
    await github(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: "POST",
      body: { content: encodeBase64("portfolio-admin-permission-check"), encoding: "base64" },
    });
  }

  function normalizeData(raw) {
    return {
      profile: {
        name: "",
        title: "",
        avatar: "assets/avatar.jpg",
        bio: "",
        email: "",
        phone: "",
        location: "",
        links: {},
        ...(raw.profile || {}),
        links: { ...(raw.profile?.links || {}) },
      },
      theme: {
        primaryColor: "#6366f1",
        secondaryColor: "#22d3ee",
        backgroundColor: "#0f172a",
        cardBackgroundColor: "#1e293b",
        textColor: "#f8fafc",
        mutedTextColor: "#94a3b8",
        fontFamily: "system-ui, -apple-system, sans-serif",
        ...(raw.theme || {}),
      },
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      works: Array.isArray(raw.works) ? raw.works : [],
    };
  }

  function openEditor(login) {
    $("#login-view").hidden = true;
    $("#editor-view").hidden = false;
    $("#logout-button").hidden = false;
    const connection = $("#connection-state");
    connection.textContent = `已验证：${login}`;
    connection.classList.add("connected");
    fillProfileForm();
    fillThemeForm();
    fillCategoryOptions();
    renderWorkList();
  }

  function logout() {
    if (state.dirty && !window.confirm("尚有未发布的修改，确定退出吗？")) return;
    state.pending.forEach((item) => URL.revokeObjectURL(item.preview));
    state.pending.clear();
    state.token = "";
    state.data = null;
    state.dataSha = "";
    state.selectedId = "";
    state.dirty = false;
    $("#editor-view").hidden = true;
    $("#login-view").hidden = false;
    $("#logout-button").hidden = true;
    const connection = $("#connection-state");
    connection.textContent = "未登录";
    connection.classList.remove("connected");
  }

  function bindNavigation() {
    $$(".nav-item").forEach((button) => {
      button.addEventListener("click", () => {
        $$(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
        $$(".editor-panel").forEach((panel) => {
          const active = panel.id === button.dataset.panel;
          panel.hidden = !active;
          panel.classList.toggle("active", active);
        });
      });
    });
  }

  function bindProfileEditor() {
    const fields = ["name", "title", "bio", "email", "phone", "location"];
    fields.forEach((field) => {
      $(`#profile-${field}-input`).addEventListener("input", () => { state.dirty = true; });
    });
    ["github", "website", "bilibili", "linkedin", "artstation"].forEach((field) => {
      $(`#profile-${field}-input`).addEventListener("input", () => { state.dirty = true; });
    });
    $("#profile-avatar-file").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const asset = queueFile(await optimizeImageFile(file, 512, 512, 0.82));
        state.data.profile.avatar = asset.url;
        $("#avatar-preview").src = asset.preview;
        state.dirty = true;
      } catch (error) { toast(error.message); }
      event.target.value = "";
    });
  }

  function fillProfileForm() {
    const profile = state.data.profile;
    ["name", "title", "bio", "email", "phone", "location"].forEach((field) => {
      $(`#profile-${field}-input`).value = profile[field] || "";
    });
    ["github", "website", "bilibili", "linkedin", "artstation"].forEach((field) => {
      $(`#profile-${field}-input`).value = profile.links?.[field] || "";
    });
    $("#avatar-preview").src = previewUrl(profile.avatar);
  }

  function syncProfileForm(target = state.data) {
    ["name", "title", "bio", "email", "phone", "location"].forEach((field) => {
      target.profile[field] = $(`#profile-${field}-input`).value.trim();
    });
    target.profile.links ||= {};
    ["github", "website", "bilibili", "linkedin", "artstation"].forEach((field) => {
      target.profile.links[field] = $(`#profile-${field}-input`).value.trim();
    });
  }

  function bindThemeEditor() {
    const ids = ["theme-primary", "theme-secondary", "theme-background", "theme-card", "theme-text", "theme-muted", "theme-font"];
    ids.forEach((id) => {
      $("#" + id).addEventListener("input", () => {
        syncThemeForm();
        updateThemePreview();
        state.dirty = true;
      });
    });
    $("#reset-theme").addEventListener("click", () => {
      state.data.theme = {
        primaryColor: "#6366f1",
        secondaryColor: "#22d3ee",
        backgroundColor: "#0f172a",
        cardBackgroundColor: "#1e293b",
        textColor: "#f8fafc",
        mutedTextColor: "#94a3b8",
        fontFamily: "system-ui, -apple-system, sans-serif",
      };
      fillThemeForm();
      state.dirty = true;
      toast("已恢复参考图配色，发布后生效");
    });
  }

  function fillThemeForm() {
    const theme = state.data.theme;
    $("#theme-primary").value = safeColor(theme.primaryColor, "#6366f1");
    $("#theme-secondary").value = safeColor(theme.secondaryColor, "#22d3ee");
    $("#theme-background").value = safeColor(theme.backgroundColor, "#0f172a");
    $("#theme-card").value = safeColor(theme.cardBackgroundColor, "#1e293b");
    $("#theme-text").value = safeColor(theme.textColor, "#f8fafc");
    $("#theme-muted").value = safeColor(theme.mutedTextColor, "#94a3b8");
    $("#theme-font").value = theme.fontFamily || "system-ui, -apple-system, sans-serif";
    updateThemePreview();
  }

  function syncThemeForm(target = state.data) {
    target.theme.primaryColor = $("#theme-primary").value;
    target.theme.secondaryColor = $("#theme-secondary").value;
    target.theme.backgroundColor = $("#theme-background").value;
    target.theme.cardBackgroundColor = $("#theme-card").value;
    target.theme.textColor = $("#theme-text").value;
    target.theme.mutedTextColor = $("#theme-muted").value;
    target.theme.fontFamily = $("#theme-font").value.trim() || "system-ui, sans-serif";
  }

  function updateThemePreview() {
    const preview = $("#theme-preview");
    preview.style.setProperty("--preview-primary", $("#theme-primary").value);
    preview.style.setProperty("--preview-bg", $("#theme-background").value);
    preview.style.setProperty("--preview-card", $("#theme-card").value);
    preview.style.setProperty("--preview-text", $("#theme-text").value);
    preview.style.setProperty("--preview-muted", $("#theme-muted").value);
    preview.style.fontFamily = $("#theme-font").value;
  }

  function bindWorkEditor() {
    $("#work-search").addEventListener("input", renderWorkList);
    $("#work-category-filter").addEventListener("change", renderWorkList);
    $("#add-work").addEventListener("click", addWork);
    $("#delete-work").addEventListener("click", deleteSelectedWork);
    $("#work-editor").addEventListener("submit", (event) => {
      event.preventDefault();
      saveSelectedWork();
      toast("当前作品已保存到待发布修改");
    });
    ["work-title", "work-category", "work-date", "work-tags", "work-description"].forEach((id) => {
      $("#" + id).addEventListener("input", () => { state.dirty = true; });
    });
    $("#work-cover-file").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      const work = selectedWork();
      if (!file || !work) return;
      try {
        const asset = queueFile(await optimizeImageFile(file, 960, 540, 0.78));
        work.cover = asset.url;
        $("#work-cover-preview").src = asset.preview;
        state.dirty = true;
        renderWorkList();
      } catch (error) { toast(error.message); }
      event.target.value = "";
    });
    $("#work-media-files").addEventListener("change", (event) => {
      const work = selectedWork();
      if (!work) return;
      try {
        [...event.target.files].forEach((file) => {
          const asset = queueFile(file);
          work.media ||= [];
          work.media.push({ type: isVideo(file) ? "video" : "image", url: asset.url, caption: file.name });
        });
        state.dirty = true;
        renderAssetLists(work);
      } catch (error) { toast(error.message); }
      event.target.value = "";
    });
    $("#work-attachment-files").addEventListener("change", (event) => {
      const work = selectedWork();
      if (!work) return;
      try {
        [...event.target.files].forEach((file) => {
          const asset = queueFile(file);
          work.files ||= [];
          work.files.push({ url: asset.url, name: file.name });
        });
        state.dirty = true;
        renderAssetLists(work);
      } catch (error) { toast(error.message); }
      event.target.value = "";
    });
  }

  function fillCategoryOptions() {
    const editor = $("#work-category");
    const filter = $("#work-category-filter");
    editor.replaceChildren();
    filter.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
    state.data.categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      editor.append(option);
      filter.append(option.cloneNode(true));
    });
  }

  function renderWorkList() {
    if (!state.data) return;
    const list = $("#work-list");
    const query = $("#work-search").value.trim().toLowerCase();
    const categoryFilter = $("#work-category-filter").value;
    list.replaceChildren();
    state.data.works
      .filter((work) => (!query || work.title.toLowerCase().includes(query)) && (categoryFilter === "all" || work.category === categoryFilter))
      .forEach((work) => {
        const category = state.data.categories.find((item) => item.id === work.category);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "work-list-item";
        button.classList.toggle("active", work.id === state.selectedId);
        const image = document.createElement("img");
        image.src = previewUrl(work.cover);
        image.alt = "";
        const copy = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = work.title || "未命名作品";
        const meta = document.createElement("small");
        meta.textContent = `${category?.name || "未分类"}${work.date ? ` · ${work.date}` : ""}`;
        copy.append(title, meta);
        button.append(image, copy);
        button.addEventListener("click", () => selectWork(work.id));
        list.append(button);
      });
  }

  function selectWork(id) {
    if (state.selectedId && state.selectedId !== id) saveSelectedWork(false);
    state.selectedId = id;
    const work = selectedWork();
    if (!work) return;
    $("#work-editor-empty").hidden = true;
    $("#work-editor").hidden = false;
    $("#work-editor-heading").textContent = work.title || "编辑作品";
    $("#work-title").value = work.title || "";
    $("#work-category").value = work.category || state.data.categories[0]?.id || "";
    $("#work-date").value = work.date || "";
    $("#work-tags").value = (work.tags || []).join(", ");
    $("#work-description").value = work.description || "";
    $("#work-cover-preview").src = previewUrl(work.cover);
    renderAssetLists(work);
    renderWorkList();
  }

  function saveSelectedWork(showFeedback = true) {
    const work = selectedWork();
    if (!work) return;
    work.title = $("#work-title").value.trim() || "未命名作品";
    work.category = $("#work-category").value;
    work.date = $("#work-date").value.trim();
    work.description = $("#work-description").value.trim();
    work.tags = $("#work-tags").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
    $("#work-editor-heading").textContent = work.title;
    state.dirty = true;
    renderWorkList();
    if (showFeedback) toast("作品信息已保存");
  }

  function addWork() {
    if (state.selectedId) saveSelectedWork(false);
    const category = state.data.categories[0]?.id || "other";
    const work = {
      id: `work-${category}-${Date.now()}`,
      title: "新作品",
      category,
      cover: "assets/avatar.jpg",
      description: "",
      tags: [],
      date: String(new Date().getFullYear()),
      media: [],
      files: [],
    };
    state.data.works.unshift(work);
    state.dirty = true;
    selectWork(work.id);
  }

  function deleteSelectedWork() {
    const work = selectedWork();
    if (!work || !window.confirm(`确定删除“${work.title}”吗？删除会在发布后生效。`)) return;
    state.data.works = state.data.works.filter((item) => item.id !== work.id);
    state.selectedId = "";
    state.dirty = true;
    $("#work-editor").hidden = true;
    $("#work-editor-empty").hidden = false;
    renderWorkList();
  }

  function renderAssetLists(work) {
    const mediaList = $("#media-list");
    mediaList.replaceChildren();
    (work.media || []).forEach((media, index) => {
      mediaList.append(createAssetRow(media, media.type, () => {
        work.media.splice(index, 1);
        state.dirty = true;
        renderAssetLists(work);
      }));
    });
    const fileList = $("#file-list");
    fileList.replaceChildren();
    (work.files || []).forEach((file, index) => {
      fileList.append(createAssetRow(file, "file", () => {
        work.files.splice(index, 1);
        state.dirty = true;
        renderAssetLists(work);
      }));
    });
  }

  function createAssetRow(asset, type, remove) {
    const row = document.createElement("div");
    row.className = "asset-item";
    let preview;
    if (type === "video") {
      preview = document.createElement("video");
      preview.muted = true;
      preview.preload = "metadata";
      preview.src = previewUrl(asset.url);
    } else if (type === "image") {
      preview = document.createElement("img");
      preview.src = previewUrl(asset.url);
      preview.alt = "";
    } else {
      preview = document.createElement("span");
      preview.textContent = "FILE";
    }
    const name = document.createElement("span");
    name.textContent = asset.caption || asset.name || asset.url.split("/").pop();
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "移除";
    button.addEventListener("click", remove);
    row.append(preview, name, button);
    return row;
  }

  function selectedWork() {
    return state.data?.works.find((work) => work.id === state.selectedId);
  }

  function queueFile(file) {
    if (file.size > MAX_FILE_SIZE) throw new Error(`“${file.name}”超过 50MB，请先压缩后再上传。`);
    const extension = file.name.includes(".") ? `.${file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
    const unique = `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
    const url = `assets/upload-${unique}${extension}`;
    const item = { file, url, path: `dist/${url}`, preview: URL.createObjectURL(file) };
    state.pending.set(url, item);
    return item;
  }

  function optimizeImageFile(file, targetWidth, targetHeight, quality) {
    if (!file.type.startsWith("image/")) return Promise.reject(new Error("请选择图片文件。"));
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext("2d", { alpha: false });
          context.fillStyle = "#080d18";
          context.fillRect(0, 0, targetWidth, targetHeight);
          const scale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
          const width = image.naturalWidth * scale;
          const height = image.naturalHeight * scale;
          context.drawImage(image, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error("封面压缩失败，请更换图片后重试。"));
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-") || "cover";
            resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
          }, "image/jpeg", quality);
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          reject(error);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("无法读取这张图片，请更换文件后重试。"));
      };
      image.src = objectUrl;
    });
  }

  async function publishAll() {
    const button = $("#publish-button");
    const status = $("#publish-status");
    button.disabled = true;
    status.className = "publish-status";
    try {
      if (state.selectedId) saveSelectedWork(false);
      syncProfileForm();
      syncThemeForm();
      const draft = clone(state.data);
      const referenced = collectAssetUrls(draft);
      const uploads = [...state.pending.values()].filter((item) => referenced.has(item.url));
      const treeEntries = [];
      for (let index = 0; index < uploads.length; index += 1) {
        const item = uploads[index];
        status.textContent = `正在准备文件 ${index + 1}/${uploads.length}：${item.file.name}`;
        const blob = await createBlob(await fileToBase64(item.file));
        treeEntries.push({ path: item.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      status.textContent = "正在发布网站数据…";
      const json = `${JSON.stringify(draft, null, 2)}\n`;
      const dataBlob = await createBlob(encodeBase64(json));
      treeEntries.push({ path: DATA_PATH, mode: "100644", type: "blob", sha: dataBlob.sha });
      const reference = await github(`/repos/${OWNER}/${REPO}/git/ref/heads/${encodeURIComponent(BRANCH)}`);
      const parentSha = reference.object.sha;
      const parentCommit = await github(`/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
      const tree = await github(`/repos/${OWNER}/${REPO}/git/trees`, {
        method: "POST",
        body: { base_tree: parentCommit.tree.sha, tree: treeEntries },
      });
      const commit = await github(`/repos/${OWNER}/${REPO}/git/commits`, {
        method: "POST",
        body: {
          message: "通过作品集后台更新内容",
          tree: tree.sha,
          parents: [parentSha],
        },
      });
      await github(`/repos/${OWNER}/${REPO}/git/refs/heads/${encodeURIComponent(BRANCH)}`, {
        method: "PATCH",
        body: { sha: commit.sha, force: false },
      });
      state.dataSha = dataBlob.sha;
      state.data = draft;
      state.pending.forEach((item) => URL.revokeObjectURL(item.preview));
      state.pending.clear();
      state.dirty = false;
      status.className = "publish-status success";
      status.textContent = "发布成功。网站通常会在 1–3 分钟内自动更新。";
      toast("发布成功，GitHub 正在更新公开网站");
      fillProfileForm();
      if (state.selectedId) selectWork(state.selectedId);
    } catch (error) {
      status.className = "publish-status error";
      status.textContent = friendlyError(error);
      toast("发布失败，请查看提示");
    } finally {
      button.disabled = false;
    }
  }

  function createBlob(content) {
    return github(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: "POST",
      body: { content, encoding: "base64" },
    });
  }

  async function github(endpoint, options = {}, attempt = 0) {
    try {
      const response = await fetch(`${API_ROOT}${endpoint}`, {
        method: options.method || "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${state.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      let payload = null;
      try { payload = await response.json(); } catch { payload = {}; }
      if (!response.ok) {
        const apiMessage = payload.message || `GitHub 请求失败（${response.status}）`;
        const rateLimited = response.status === 429 || (response.status === 403 && /rate limit|abuse detection/i.test(apiMessage));
        if ((rateLimited || response.status >= 500) && attempt < 4) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt;
          await wait(Math.min(waitMs, 20000));
          return github(endpoint, options, attempt + 1);
        }
        const error = new Error(apiMessage);
        error.status = response.status;
        error.apiMessage = apiMessage;
        error.documentationUrl = payload.documentation_url || "";
        throw error;
      }
      return payload;
    } catch (error) {
      if (!error.status && attempt < 3) {
        await wait(1000 * 2 ** attempt);
        return github(endpoint, options, attempt + 1);
      }
      throw error;
    }
  }

  function collectAssetUrls(data) {
    const urls = new Set();
    if (data.profile.avatar) urls.add(data.profile.avatar);
    data.works.forEach((work) => {
      if (work.cover) urls.add(work.cover);
      (work.media || []).forEach((item) => item.url && urls.add(item.url));
      (work.files || []).forEach((item) => item.url && urls.add(item.url));
    });
    return urls;
  }

  function previewUrl(url) {
    if (!url) return "./assets/avatar.jpg";
    if (state.pending.has(url)) return state.pending.get(url).preview;
    if (/^(blob:|data:|https?:)/i.test(url)) return url;
    return `./${url.replace(/^\.\//, "")}`;
  }

  function isVideo(file) {
    return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  }

  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  }

  function decodeBase64(encoded) {
    const binary = atob(encoded.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error(`无法读取文件：${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function safeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  }

  function friendlyError(error) {
    if (error.status === 401) return "密钥无效或已过期，请重新创建管理员密钥。";
    if (error.status === 403 && /rate limit|abuse detection/i.test(error.apiMessage || "")) return "GitHub 暂时限制了连续上传。请等待 1 分钟后再点发布，未发布的修改仍保留在当前页面。";
    if (error.status === 403) return "这枚密钥没有仓库内容写入权限。请在 GitHub 的 Fine-grained tokens 中编辑或新建密钥：Repository access 选择 Only select repositories → huzhibinnnn-coder.github.io；Repository permissions 将 Contents 设为 Read and write；保存后复制新密钥并重新登录。";
    if (error.status === 404) return "这枚密钥没有选择网站仓库。请在 Repository access 中勾选 huzhibinnnn-coder.github.io。";
    if (error.status === 409) return "仓库内容刚刚发生变化，请刷新后台后重试。";
    if (error.status === 422) return `GitHub 未接受这次发布：${error.message}。请刷新后台后重试。`;
    return error.message || "操作失败，请检查网络后重试。";
  }

  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.hidden = false;
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => { element.hidden = true; }, 3200);
  }
})();
