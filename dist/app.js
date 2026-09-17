(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const deepCopy = (value) => JSON.parse(JSON.stringify(value));

  const state = {
    data: null,
    activeCategory: "all",
    github: { owner: "", repo: "", branch: "main", token: "", connected: false },
    toastTimer: null,
  };

  const themePresets = {
    midnight: {
      primaryColor: "#7c6cff",
      secondaryColor: "#31e6d2",
      backgroundColor: "#080b12",
      cardBackgroundColor: "#121722",
      textColor: "#f5f7fb",
      mutedTextColor: "#9ba6b8",
    },
    graphite: {
      primaryColor: "#ff7a35",
      secondaryColor: "#ffd166",
      backgroundColor: "#101010",
      cardBackgroundColor: "#1b1b1b",
      textColor: "#f5f3ef",
      mutedTextColor: "#aaa7a1",
    },
    cloud: {
      primaryColor: "#375dfb",
      secondaryColor: "#087f8c",
      backgroundColor: "#f3f5f8",
      cardBackgroundColor: "#ffffff",
      textColor: "#10131a",
      mutedTextColor: "#626a78",
    },
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindBaseEvents();
    inferRepository();

    try {
      const response = await fetch(`./data/portfolio.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`无法读取作品数据（${response.status}）`);
      state.data = await response.json();

      if (new URLSearchParams(location.search).has("edit")) {
        const draft = localStorage.getItem("portfolio-draft");
        if (draft) {
          try {
            state.data = JSON.parse(draft);
            showToast("已恢复本设备上的未发布预览");
          } catch {
            localStorage.removeItem("portfolio-draft");
          }
        }
      }

      normalizeData();
      renderAll();
      populateEditor();
    } catch (error) {
      $("#work-grid").innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p><p>请通过静态文件服务器打开网站。</p></div>`;
      console.error(error);
    }
  }

  function normalizeData() {
    state.data.profile ||= {};
    state.data.theme ||= deepCopy(themePresets.midnight);
    state.data.categories ||= [];
    state.data.works ||= [];
    state.data.works.forEach((work) => {
      work.media ||= [];
      work.files ||= [];
      work.tags ||= [];
    });
  }

  function bindBaseEvents() {
    $("#open-editor").addEventListener("click", openEditor);
    $("#close-editor").addEventListener("click", () => $("#editor-dialog").close());
    $("#close-work").addEventListener("click", () => $("#work-dialog").close());

    [$("#work-dialog"), $("#editor-dialog")].forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });

    $$(".editor-tab").forEach((tab) => {
      tab.addEventListener("click", () => activateEditorPanel(tab.dataset.panel));
    });

    $$('[data-theme-preset]').forEach((button) => {
      button.addEventListener("click", () => setThemeForm(themePresets[button.dataset.themePreset]));
    });

    $("#preview-profile").addEventListener("click", previewProfile);
    $("#publish-profile").addEventListener("click", publishProfile);
    $("#edit-work-select").addEventListener("change", fillWorkForm);
    $("#preview-work").addEventListener("click", previewWork);
    $("#publish-work").addEventListener("click", publishWork);
    $("#delete-work").addEventListener("click", deleteWork);
    $("#connect-github").addEventListener("click", connectGithub);
  }

  function renderAll() {
    applyTheme(state.data.theme);
    renderProfile();
    renderFilters();
    renderWorks();
    document.title = `${state.data.profile.name || "个人"}｜数字媒体艺术作品集`;
    $("#updated-date").textContent = new Date().getFullYear();
  }

  function renderProfile() {
    const profile = state.data.profile;
    const name = profile.name || "未填写姓名";
    $("#nav-name").textContent = name;
    $("#profile-name").textContent = name;
    $("#profile-title").textContent = profile.title || "数字媒体艺术";
    $("#profile-bio").textContent = profile.bio || "";
    $("#work-total").textContent = String(state.data.works.length).padStart(2, "0");
    $("#profile-avatar").src = assetUrl(profile.avatar || "assets/avatar.jpg");
    $("#profile-avatar").alt = `${name}的头像`;

    const contacts = [];
    if (profile.email) contacts.push([`mailto:${profile.email}`, profile.email]);
    if (profile.phone) contacts.push([`tel:${profile.phone.replace(/\s/g, "")}`, profile.phone]);
    if (profile.location) contacts.push(["", profile.location]);
    Object.entries(profile.links || {}).forEach(([key, url]) => {
      if (url) contacts.push([url, socialLabel(key)]);
    });

    const row = $("#contact-row");
    row.replaceChildren();
    contacts.forEach(([href, label]) => {
      const item = document.createElement(href ? "a" : "span");
      item.className = "contact-link";
      item.textContent = label;
      if (href) {
        item.href = href;
        if (/^https?:/.test(href)) {
          item.target = "_blank";
          item.rel = "noreferrer";
        }
      }
      row.append(item);
    });
  }

  function renderFilters() {
    const bar = $("#filter-bar");
    bar.replaceChildren();
    const filters = [{ id: "all", name: "全部", icon: "" }, ...state.data.categories];

    filters.forEach((category) => {
      const count = category.id === "all"
        ? state.data.works.length
        : state.data.works.filter((work) => work.category === category.id).length;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-button${state.activeCategory === category.id ? " active" : ""}`;
      button.setAttribute("aria-pressed", String(state.activeCategory === category.id));
      button.innerHTML = `${category.icon ? `${escapeHtml(category.icon)} ` : ""}${escapeHtml(category.name)}<span class="filter-count">${count}</span>`;
      button.addEventListener("click", () => {
        state.activeCategory = category.id;
        renderFilters();
        renderWorks();
      });
      bar.append(button);
    });
  }

  function renderWorks() {
    const works = state.activeCategory === "all"
      ? state.data.works
      : state.data.works.filter((work) => work.category === state.activeCategory);
    const grid = $("#work-grid");
    grid.replaceChildren();

    works.forEach((work) => grid.append(createWorkCard(work)));
    $("#empty-state").hidden = works.length > 0;
    const category = state.activeCategory === "all" ? { name: "全部作品" } : getCategory(state.activeCategory);
    $("#filter-summary").textContent = `${category?.name || "作品"} · ${works.length}`;
  }

  function createWorkCard(work) {
    const category = getCategory(work.category);
    const article = document.createElement("article");
    article.className = "work-card";
    article.tabIndex = 0;
    article.setAttribute("role", "button");
    article.setAttribute("aria-label", `查看作品：${work.title}`);

    const mediaCount = (work.media?.length || 0) + (work.files?.length || 0);
    article.innerHTML = `
      <div class="work-card-media">
        <img src="${escapeAttribute(assetUrl(work.cover))}" alt="${escapeAttribute(work.title)}封面" loading="lazy" decoding="async" />
        <span class="media-badge">${mediaCount} 项内容</span>
      </div>
      <div class="work-card-copy">
        <div>
          <h3>${escapeHtml(work.title)}</h3>
          <div class="work-card-meta"><span>${escapeHtml(category?.name || "其他")}</span><time>${escapeHtml(work.date || "")}</time></div>
        </div>
        <span class="card-arrow" aria-hidden="true">↗</span>
      </div>`;

    const open = () => openWork(work.id);
    article.addEventListener("click", open);
    article.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    return article;
  }

  function openWork(id) {
    const work = state.data.works.find((item) => item.id === id);
    if (!work) return;
    const category = getCategory(work.category);
    $("#dialog-category").textContent = `${category?.icon || ""} ${category?.name || "作品"}`.trim();
    $("#dialog-title").textContent = work.title;
    $("#dialog-date").textContent = work.date || "";
    $("#dialog-description").textContent = work.description || "点击下方媒体查看完整作品。";

    const mediaRoot = $("#dialog-media");
    mediaRoot.replaceChildren();
    (work.media || []).forEach((media) => {
      const figure = document.createElement("figure");
      figure.className = "media-item";
      const isVideo = media.type === "video" || /\.(mp4|webm|mov)$/i.test(media.url || "");
      const element = document.createElement(isVideo ? "video" : "img");
      element.src = assetUrl(media.url);
      if (isVideo) {
        element.controls = true;
        element.preload = "metadata";
        element.playsInline = true;
      } else {
        element.alt = media.caption || work.title;
        element.loading = "lazy";
      }
      figure.append(element);
      if (media.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = media.caption;
        figure.append(caption);
      }
      mediaRoot.append(figure);
    });

    const fileRoot = $("#dialog-files");
    fileRoot.replaceChildren();
    (work.files || []).forEach((file) => {
      const link = document.createElement("a");
      link.className = "file-link";
      link.href = assetUrl(file.url);
      link.download = file.name || "作品附件";
      link.innerHTML = `<span>${escapeHtml(file.name || "作品附件")}</span><span>下载 ↓</span>`;
      fileRoot.append(link);
    });

    $("#work-dialog").showModal();
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const background = theme.backgroundColor || "#080b12";
    const card = theme.cardBackgroundColor || "#121722";
    const text = theme.textColor || "#f5f7fb";
    const light = relativeLuminance(background) > 0.5;
    root.style.setProperty("--primary", theme.primaryColor || "#7c6cff");
    root.style.setProperty("--secondary", theme.secondaryColor || "#31e6d2");
    root.style.setProperty("--background", background);
    root.style.setProperty("--surface", card);
    root.style.setProperty("--surface-2", mixColors(card, light ? "#000000" : "#ffffff", 0.06));
    root.style.setProperty("--text", text);
    root.style.setProperty("--muted", theme.mutedTextColor || mixColors(text, background, 0.42));
    root.style.setProperty("--line", light ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.12)");
    root.style.setProperty("--line-strong", light ? "rgba(0,0,0,.22)" : "rgba(255,255,255,.22)");
    root.style.setProperty("--font", theme.fontFamily || "system-ui, -apple-system, 'Segoe UI', sans-serif");
    root.style.colorScheme = light ? "light" : "dark";
    $('meta[name="theme-color"]').content = background;
  }

  function openEditor() {
    if (!state.data) return;
    populateEditor();
    $("#editor-dialog").showModal();
  }

  function populateEditor() {
    if (!state.data) return;
    const profile = state.data.profile;
    $("#edit-name").value = profile.name || "";
    $("#edit-title").value = profile.title || "";
    $("#edit-bio").value = profile.bio || "";
    $("#edit-email").value = profile.email || "";
    $("#edit-phone").value = profile.phone || "";
    $("#edit-location").value = profile.location || "";
    setThemeForm(state.data.theme);
    populateCategorySelect();
    populateWorkSelect();
    fillWorkForm();
  }

  function setThemeForm(theme) {
    $("#edit-primary").value = theme.primaryColor || "#7c6cff";
    $("#edit-secondary").value = theme.secondaryColor || "#31e6d2";
    $("#edit-background").value = theme.backgroundColor || "#080b12";
    $("#edit-card").value = theme.cardBackgroundColor || "#121722";
    $("#edit-text").value = theme.textColor || "#f5f7fb";
    $("#edit-font").value = [...$("#edit-font").options].some((option) => option.value === theme.fontFamily)
      ? theme.fontFamily
      : $("#edit-font").options[0].value;
  }

  function readProfileForm() {
    const next = deepCopy(state.data);
    next.profile = {
      ...next.profile,
      name: $("#edit-name").value.trim(),
      title: $("#edit-title").value.trim(),
      bio: $("#edit-bio").value.trim(),
      email: $("#edit-email").value.trim(),
      phone: $("#edit-phone").value.trim(),
      location: $("#edit-location").value.trim(),
    };
    const background = $("#edit-background").value;
    const text = $("#edit-text").value;
    next.theme = {
      ...next.theme,
      primaryColor: $("#edit-primary").value,
      secondaryColor: $("#edit-secondary").value,
      backgroundColor: background,
      cardBackgroundColor: $("#edit-card").value,
      textColor: text,
      mutedTextColor: mixColors(text, background, 0.42),
      fontFamily: $("#edit-font").value,
    };
    return next;
  }

  function previewProfile() {
    const next = readProfileForm();
    const avatar = $("#edit-avatar").files[0];
    if (avatar) next.profile.avatar = URL.createObjectURL(avatar);
    setDraft(next);
    showToast("个人信息与主题已在本设备预览");
  }

  async function publishProfile() {
    if (!requireGithubConnection()) return;
    const button = $("#publish-profile");
    setBusy(button, true, "正在发布…");
    try {
      const next = readProfileForm();
      const avatar = $("#edit-avatar").files[0];
      if (avatar) next.profile.avatar = await uploadAsset(avatar, `profile-avatar-${Date.now()}`);
      await pushPortfolio(next, "更新个人信息与网站主题");
      state.data = next;
      localStorage.removeItem("portfolio-draft");
      renderAll();
      populateEditor();
      showToast("发布成功，GitHub Pages 正在更新");
    } catch (error) {
      showToast(`发布失败：${error.message}`);
    } finally {
      setBusy(button, false);
    }
  }

  function populateCategorySelect() {
    const select = $("#edit-work-category");
    select.replaceChildren();
    state.data.categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = `${category.icon || ""} ${category.name}`.trim();
      select.append(option);
    });
  }

  function populateWorkSelect(selected = "__new__") {
    const select = $("#edit-work-select");
    select.replaceChildren();
    const fresh = document.createElement("option");
    fresh.value = "__new__";
    fresh.textContent = "＋ 添加新作品";
    select.append(fresh);
    state.data.works.forEach((work) => {
      const option = document.createElement("option");
      option.value = work.id;
      option.textContent = work.title;
      select.append(option);
    });
    select.value = selected;
  }

  function fillWorkForm() {
    const id = $("#edit-work-select").value;
    const work = state.data?.works.find((item) => item.id === id);
    $("#edit-work-title").value = work?.title || "";
    $("#edit-work-category").value = work?.category || state.data?.categories[0]?.id || "";
    $("#edit-work-date").value = work?.date || "";
    $("#edit-work-tags").value = (work?.tags || []).join(", ");
    $("#edit-work-description").value = work?.description || "";
    $("#edit-work-cover").value = "";
    $("#edit-work-media").value = "";
    $("#edit-work-files").value = "";
    $("#delete-work").hidden = !work;
  }

  function baseWorkFromForm() {
    const selectedId = $("#edit-work-select").value;
    const existing = state.data.works.find((item) => item.id === selectedId);
    const category = $("#edit-work-category").value;
    const work = existing
      ? deepCopy(existing)
      : {
          id: `work-${category}-${Date.now().toString(36)}`,
          cover: "",
          media: [],
          files: [],
        };
    work.title = $("#edit-work-title").value.trim();
    work.category = category;
    work.date = $("#edit-work-date").value.trim();
    work.description = $("#edit-work-description").value.trim();
    work.tags = $("#edit-work-tags").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
    if (!work.title || !work.category) throw new Error("请填写作品名称并选择分类");
    return { work, isNew: !existing };
  }

  function collectLocalWork() {
    const { work, isNew } = baseWorkFromForm();
    const cover = $("#edit-work-cover").files[0];
    const media = [...$("#edit-work-media").files];
    const files = [...$("#edit-work-files").files];
    if (isNew && !cover) throw new Error("新增作品需要一张封面图");
    if (cover) work.cover = URL.createObjectURL(cover);
    media.forEach((file) => work.media.push({
      type: file.type.startsWith("video/") ? "video" : "image",
      url: URL.createObjectURL(file),
      caption: file.name,
    }));
    files.forEach((file) => work.files.push({ name: file.name, url: URL.createObjectURL(file), size: file.size }));
    return { work, isNew };
  }

  function previewWork() {
    try {
      const { work, isNew } = collectLocalWork();
      const next = deepCopy(state.data);
      const index = next.works.findIndex((item) => item.id === work.id);
      if (isNew || index < 0) next.works.unshift(work);
      else next.works[index] = work;
      setDraft(next);
      populateWorkSelect(work.id);
      fillWorkForm();
      showToast("作品已在本设备预览");
    } catch (error) {
      showToast(error.message);
    }
  }

  async function publishWork() {
    if (!requireGithubConnection()) return;
    const button = $("#publish-work");
    setBusy(button, true, "正在上传…");
    try {
      const { work, isNew } = baseWorkFromForm();
      const cover = $("#edit-work-cover").files[0];
      const media = [...$("#edit-work-media").files];
      const files = [...$("#edit-work-files").files];
      if (isNew && !cover) throw new Error("新增作品需要一张封面图");

      if (cover) work.cover = await uploadAsset(cover, `${work.id}-cover-${Date.now()}`);
      for (let index = 0; index < media.length; index += 1) {
        const file = media[index];
        const url = await uploadAsset(file, `${work.id}-media-${Date.now()}-${index + 1}`);
        work.media.push({ type: file.type.startsWith("video/") ? "video" : "image", url, caption: file.name });
      }
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const url = await uploadAsset(file, `${work.id}-file-${Date.now()}-${index + 1}`);
        work.files.push({ name: file.name, url, type: file.type, size: file.size });
      }

      const next = deepCopy(state.data);
      const existingIndex = next.works.findIndex((item) => item.id === work.id);
      if (isNew || existingIndex < 0) next.works.unshift(work);
      else next.works[existingIndex] = work;
      await pushPortfolio(next, `${isNew ? "添加" : "更新"}作品：${work.title}`);

      state.data = next;
      localStorage.removeItem("portfolio-draft");
      renderAll();
      populateWorkSelect(work.id);
      fillWorkForm();
      showToast("作品已发布，页面将在 GitHub Pages 更新后生效");
    } catch (error) {
      showToast(`发布失败：${error.message}`);
    } finally {
      setBusy(button, false);
    }
  }

  async function deleteWork() {
    const id = $("#edit-work-select").value;
    const work = state.data.works.find((item) => item.id === id);
    if (!work || !confirm(`确定删除“${work.title}”吗？已上传的媒体文件不会自动删除。`)) return;

    const next = deepCopy(state.data);
    next.works = next.works.filter((item) => item.id !== id);
    try {
      if (state.github.connected) await pushPortfolio(next, `删除作品：${work.title}`);
      state.data = next;
      if (state.github.connected) localStorage.removeItem("portfolio-draft");
      else localStorage.setItem("portfolio-draft", JSON.stringify(next));
      renderAll();
      populateWorkSelect();
      fillWorkForm();
      showToast(state.github.connected ? "作品已从目录中删除" : "已在本设备删除，连接 GitHub 后可正式发布");
    } catch (error) {
      showToast(`删除失败：${error.message}`);
    }
  }

  function setDraft(next) {
    state.data = next;
    try {
      const serialized = JSON.stringify(next);
      if (serialized.includes('"blob:')) localStorage.removeItem("portfolio-draft");
      else localStorage.setItem("portfolio-draft", serialized);
    } catch {
      localStorage.removeItem("portfolio-draft");
    }
    renderAll();
  }

  function activateEditorPanel(panelId) {
    $$(".editor-tab").forEach((tab) => {
      const active = tab.dataset.panel === panelId;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    $$('[data-editor-panel]').forEach((panel) => panel.classList.toggle("active", panel.id === panelId));
  }

  function inferRepository() {
    const saved = JSON.parse(localStorage.getItem("portfolio-repository") || "{}");
    let owner = saved.owner || "";
    let repo = saved.repo || "";
    let branch = saved.branch || "main";

    if (location.hostname.endsWith(".github.io")) {
      owner ||= location.hostname.split(".")[0];
      repo ||= location.pathname.split("/").filter(Boolean)[0] || `${owner}.github.io`;
    }

    state.github = { ...state.github, owner, repo, branch };
    $("#github-owner").value = owner;
    $("#github-repo").value = repo;
    $("#github-branch").value = branch;
  }

  async function connectGithub() {
    const button = $("#connect-github");
    const owner = $("#github-owner").value.trim();
    const repo = $("#github-repo").value.trim();
    const branch = $("#github-branch").value.trim() || "main";
    const token = $("#github-token").value.trim();
    if (!owner || !repo || !token) {
      showToast("请填写用户名、仓库名称和访问密钥");
      return;
    }

    setBusy(button, true, "正在验证…");
    state.github = { owner, repo, branch, token, connected: false };
    try {
      const repository = await githubRequest("");
      state.github.connected = true;
      localStorage.setItem("portfolio-repository", JSON.stringify({ owner, repo, branch }));
      const status = $("#connection-status");
      status.textContent = `已连接 ${repository.full_name} · ${branch}`;
      status.classList.add("connected");
      showToast("GitHub 连接成功，可以发布修改了");
    } catch (error) {
      state.github.connected = false;
      $("#connection-status").textContent = `连接失败：${error.message}`;
      $("#connection-status").classList.remove("connected");
    } finally {
      setBusy(button, false);
    }
  }

  function requireGithubConnection() {
    if (state.github.connected) return true;
    activateEditorPanel("publish-panel");
    showToast("请先验证 GitHub 连接");
    return false;
  }

  async function uploadAsset(file, prefix) {
    if (file.size > 80 * 1024 * 1024) throw new Error(`${file.name} 超过 80MB，请压缩后再上传`);
    const extension = safeExtension(file.name, file.type);
    const path = `dist/assets/${safeSlug(prefix)}${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await putGithubFile(path, bytesToBase64(bytes), `上传作品文件：${file.name}`);
    return path.replace(/^dist\//, "");
  }

  async function pushPortfolio(next, message) {
    const path = "dist/data/portfolio.json";
    const current = await githubRequest(`/contents/${encodePath(path)}?ref=${encodeURIComponent(state.github.branch)}`);
    const json = `${JSON.stringify(next, null, 2)}\n`;
    const content = bytesToBase64(new TextEncoder().encode(json));
    await putGithubFile(path, content, message, current.sha);
  }

  async function putGithubFile(path, content, message, sha = undefined) {
    const body = { message, content, branch: state.github.branch };
    if (sha) body.sha = sha;
    return githubRequest(`/contents/${encodePath(path)}`, { method: "PUT", body: JSON.stringify(body) });
  }

  async function githubRequest(endpoint, options = {}) {
    const { owner, repo, token } = state.github;
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${endpoint}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `GitHub 返回 ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }

  function getCategory(id) {
    return state.data.categories.find((category) => category.id === id);
  }

  function assetUrl(url = "") {
    if (/^(https?:|blob:|data:)/i.test(url)) return url;
    return `./${String(url).replace(/^\.\//, "")}`;
  }

  function socialLabel(key) {
    const labels = { github: "GitHub", website: "个人网站", linkedin: "LinkedIn", bilibili: "哔哩哔哩", artstation: "ArtStation" };
    return labels[key] || key;
  }

  function setBusy(button, busy, label = "") {
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = label;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent;
      button.disabled = false;
    }
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function safeExtension(name, mime = "") {
    const match = String(name).toLowerCase().match(/\.[a-z0-9]{1,8}$/);
    if (match) return match[0];
    const known = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "video/mp4": ".mp4", "application/pdf": ".pdf" };
    return known[mime] || "";
  }

  function safeSlug(value) {
    return String(value)
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 90) || `file-${Date.now()}`;
  }

  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const size = 0x8000;
    for (let index = 0; index < bytes.length; index += size) {
      binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + size, bytes.length)));
    }
    return btoa(binary);
  }

  function mixColors(colorA, colorB, weight = 0.5) {
    const a = hexToRgb(colorA);
    const b = hexToRgb(colorB);
    if (!a || !b) return colorA;
    const mix = (key) => Math.round(a[key] * (1 - weight) + b[key] * weight);
    return `#${[mix("r"), mix("g"), mix("b")].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function relativeLuminance(color) {
    const rgb = hexToRgb(color);
    if (!rgb) return 0;
    const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function hexToRgb(color) {
    const value = String(color).replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return null;
    return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
