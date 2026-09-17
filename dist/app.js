(() => {
  "use strict";

  const state = { data: null, expanded: new Set() };
  const $ = (selector, root = document) => root.querySelector(selector);

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    try {
      const response = await fetch(`./data/portfolio.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.data = normalizeData(await response.json());
      applyTheme(state.data.theme);
      renderProfile(state.data.profile);
      renderNavigation(state.data.categories);
      renderCategories();
      bindPageEvents();
      $("#loading-state").hidden = true;
    } catch (error) {
      const loading = $("#loading-state");
      loading.textContent = "作品加载失败，请刷新页面重试";
      console.error(error);
    }
  }

  function normalizeData(raw) {
    const defaults = {
      profile: { name: "作品集", title: "", avatar: "", bio: "", email: "", phone: "", location: "", links: {} },
      theme: {},
      categories: [],
      works: [],
    };
    return {
      ...defaults,
      ...raw,
      profile: { ...defaults.profile, ...(raw.profile || {}), links: { ...(raw.profile?.links || {}) } },
      theme: { ...(raw.theme || {}) },
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      works: Array.isArray(raw.works) ? raw.works : [],
    };
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const values = {
      "--primary": theme.primaryColor,
      "--secondary": theme.secondaryColor,
      "--background": theme.backgroundColor,
      "--surface": theme.cardBackgroundColor,
      "--text": theme.textColor,
      "--muted": theme.mutedTextColor,
      "--font": theme.fontFamily,
    };
    Object.entries(values).forEach(([property, value]) => {
      if (typeof value === "string" && value.trim()) root.style.setProperty(property, value.trim());
    });
    const meta = $('meta[name="theme-color"]');
    if (meta && theme.backgroundColor) meta.content = theme.backgroundColor;
  }

  function renderProfile(profile) {
    document.title = `${profile.name || "作品集"}｜数字媒体艺术作品集`;
    $("#profile-name").textContent = profile.name;
    $("#card-name").textContent = profile.name;
    $("#footer-name").textContent = profile.name;
    $("#profile-title").textContent = profile.title || "Portfolio";
    $("#profile-bio").textContent = profile.bio;
    $("#card-bio").textContent = profile.bio;
    $("#footer-year").textContent = new Date().getFullYear();

    const avatar = $("#profile-avatar");
    avatar.src = normalizeAssetUrl(profile.avatar || "assets/avatar.jpg");
    avatar.alt = `${profile.name}的头像`;

    const contact = $("#hero-contact");
    if (profile.email) contact.href = `mailto:${profile.email}`;
    else contact.hidden = true;

    const contactList = $("#contact-list");
    contactList.replaceChildren();
    if (profile.email) contactList.append(makeContact("✉", profile.email, `mailto:${profile.email}`));
    if (profile.phone) contactList.append(makeContact("☎", profile.phone, `tel:${profile.phone.replace(/\s+/g, "")}`));
    if (profile.location) contactList.append(makeContact("⌖", profile.location));

    const socialNames = { github: "GH", website: "↗", linkedin: "in", bilibili: "B", artstation: "A" };
    const socialList = $("#social-list");
    socialList.replaceChildren();
    Object.entries(profile.links || {}).forEach(([key, url]) => {
      if (!url) return;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = socialNames[key] || "↗";
      link.title = key;
      link.setAttribute("aria-label", key);
      socialList.append(link);
    });
  }

  function makeContact(icon, text, href = "") {
    const item = document.createElement(href ? "a" : "span");
    if (href) item.href = href;
    item.textContent = `${icon} ${text}`;
    return item;
  }

  function renderNavigation(categories) {
    const nav = $("#main-nav");
    nav.querySelectorAll("a:not(:first-child)").forEach((link) => link.remove());
    categories.forEach((category) => {
      const link = document.createElement("a");
      link.href = `#category-${category.id}`;
      link.textContent = category.name;
      nav.append(link);
    });
  }

  function renderCategories() {
    const container = $("#category-sections");
    container.replaceChildren();
    state.data.categories.forEach((category) => {
      const works = state.data.works.filter((work) => work.category === category.id).slice().reverse();
      const section = document.createElement("section");
      section.className = "category-section";
      section.id = `category-${category.id}`;

      const heading = document.createElement("div");
      heading.className = "section-heading";
      const title = document.createElement("h2");
      title.textContent = category.name;
      heading.append(title);

      if (works.length > 4) {
        const toggle = document.createElement("button");
        toggle.className = "show-more";
        toggle.type = "button";
        toggle.dataset.category = category.id;
        toggle.textContent = state.expanded.has(category.id) ? "收起 ↑" : `查看更多（${works.length}） ↗`;
        toggle.addEventListener("click", () => toggleCategory(category.id));
        heading.append(toggle);
      }

      const grid = document.createElement("div");
      grid.className = "work-grid";
      if (!works.length) {
        const empty = document.createElement("p");
        empty.className = "empty-category";
        empty.textContent = "作品正在整理中";
        grid.append(empty);
      } else {
        const visibleWorks = state.expanded.has(category.id) ? works : works.slice(0, 4);
        visibleWorks.forEach((work) => grid.append(createWorkCard(work, category)));
      }
      section.append(heading, grid);
      container.append(section);
    });
    setupScrollSpy();
  }

  function toggleCategory(categoryId) {
    if (state.expanded.has(categoryId)) state.expanded.delete(categoryId);
    else state.expanded.add(categoryId);
    renderCategories();
    if (!state.expanded.has(categoryId)) document.querySelector(`#category-${CSS.escape(categoryId)}`)?.scrollIntoView({ block: "start" });
  }

  function createWorkCard(work, category) {
    const card = document.createElement("article");
    card.className = "work-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `查看作品：${work.title}`);

    const coverWrap = document.createElement("div");
    coverWrap.className = "cover-wrap";
    const image = document.createElement("img");
    image.src = normalizeAssetUrl(work.cover);
    image.alt = work.title;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => { image.src = avatarFallback(); }, { once: true });
    coverWrap.append(image);
    const mediaCount = (work.media?.length || 0) + (work.files?.length || 0);
    if (mediaCount > 1) {
      const count = document.createElement("span");
      count.className = "media-count";
      count.textContent = `${mediaCount} 项`;
      coverWrap.append(count);
    }

    const body = document.createElement("div");
    body.className = "work-card-body";
    const title = document.createElement("h3");
    title.textContent = work.title;
    title.title = work.title;
    const meta = document.createElement("div");
    meta.className = "card-meta";
    const pill = document.createElement("span");
    pill.className = "category-pill";
    pill.textContent = category.name;
    meta.append(pill);
    if (work.date) {
      const date = document.createElement("span");
      date.className = "work-date";
      date.textContent = work.date;
      meta.append(date);
    }
    body.append(title, meta);
    card.append(coverWrap, body);
    card.addEventListener("click", () => openWork(work));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openWork(work);
      }
    });
    return card;
  }

  function openWork(work) {
    const category = state.data.categories.find((item) => item.id === work.category);
    $("#dialog-category").textContent = category?.name || "作品";
    $("#dialog-date").textContent = work.date || "";
    $("#dialog-title").textContent = work.title;
    const description = $("#dialog-description");
    description.textContent = work.description || "作品媒体展示";

    const tags = $("#dialog-tags");
    tags.replaceChildren();
    (work.tags || []).forEach((tag) => {
      const item = document.createElement("span");
      item.textContent = tag;
      tags.append(item);
    });

    const gallery = $("#dialog-media");
    gallery.replaceChildren();
    (work.media || []).forEach((media) => gallery.append(createMediaItem(media, work.title, work.cover)));
    if (!(work.media || []).length && work.cover) gallery.append(createMediaItem({ type: "image", url: work.cover, caption: work.title }, work.title, work.cover));

    const files = $("#dialog-files");
    files.replaceChildren();
    (work.files || []).forEach((file) => {
      const link = document.createElement("a");
      link.className = "file-link";
      link.href = normalizeAssetUrl(file.url);
      link.target = "_blank";
      link.rel = "noopener";
      link.download = "";
      link.textContent = `下载 ${file.name || file.caption || "文件"}`;
      files.append(link);
    });
    $("#work-dialog").showModal();
  }

  function createMediaItem(media, fallbackTitle, posterUrl) {
    const figure = document.createElement("figure");
    figure.className = "media-item";
    let element;
    if (media.type === "video") {
      element = createDeferredVideo(media, fallbackTitle, posterUrl);
    } else {
      element = document.createElement("img");
      element.loading = "lazy";
      element.alt = media.caption || fallbackTitle;
      element.src = normalizeAssetUrl(media.url);
    }
    figure.append(element);
    if (media.caption) {
      const caption = document.createElement("figcaption");
      caption.textContent = media.caption;
      figure.append(caption);
    }
    return figure;
  }

  function createDeferredVideo(media, fallbackTitle, posterUrl) {
    const shell = document.createElement("div");
    shell.className = "deferred-video";
    const poster = document.createElement("img");
    poster.src = normalizeAssetUrl(posterUrl);
    poster.alt = `${fallbackTitle}视频封面`;
    poster.loading = "lazy";
    const button = document.createElement("button");
    button.className = "video-play-button";
    button.type = "button";
    button.setAttribute("aria-label", `加载并播放视频：${media.caption || fallbackTitle}`);
    const icon = document.createElement("span");
    icon.className = "play-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "▶";
    const label = document.createElement("span");
    label.textContent = "点击播放视频";
    button.append(icon, label);
    shell.append(poster, button);

    button.addEventListener("click", () => {
      button.disabled = true;
      label.textContent = "正在加载视频…";
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "none";
      video.playsInline = true;
      video.poster = normalizeAssetUrl(posterUrl);
      video.src = normalizeAssetUrl(media.url);
      video.setAttribute("aria-label", media.caption || fallbackTitle);
      video.addEventListener("error", () => {
        shell.replaceChildren(poster, button);
        button.disabled = false;
        label.textContent = "加载失败，点击重试";
      }, { once: true });
      shell.replaceChildren(video);
      video.load();
      video.play().catch(() => {});
    });
    return shell;
  }

  function bindPageEvents() {
    const toggle = $("#nav-toggle");
    const nav = $("#main-nav");
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
    const dialog = $("#work-dialog");
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.querySelectorAll("video").forEach((video) => video.pause());
    });
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        window.location.assign("./admin.html");
      }
    });
  }

  function setupScrollSpy() {
    if (!("IntersectionObserver" in window)) return;
    const links = [...document.querySelectorAll("#main-nav a")];
    const sections = [$("#home"), ...document.querySelectorAll(".category-section")];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const hash = `#${visible.target.id}`;
      links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === hash));
    }, { rootMargin: "-20% 0px -65%", threshold: [0, 0.25, 0.75] });
    sections.filter(Boolean).forEach((section) => observer.observe(section));
  }

  function normalizeAssetUrl(url) {
    if (!url) return avatarFallback();
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return `./${String(url).replace(/^\.\//, "")}`;
  }

  function avatarFallback() {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#1e293b"/><text x="320" y="190" fill="#94a3b8" font-size="34" text-anchor="middle" font-family="sans-serif">Portfolio</text></svg>')}`;
  }
})();
