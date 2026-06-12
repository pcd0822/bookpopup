const API_BASE = "/api/aladin";

const SEARCH_EMOJIS = {
  Keyword: "🔑",
  Title: "📕",
  Author: "✍️",
};

const SEARCH_PLACEHOLDERS = {
  Keyword: "키워드를 입력해 주세요 (예: 해리포터)",
  Title: "도서명을 입력해 주세요",
  Author: "저자명을 입력해 주세요",
};

let bestsellerItems = [];
let currentSlide = 0;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showLoading() {
  $("#loading-overlay").classList.remove("hidden");
}

function hideLoading() {
  $("#loading-overlay").classList.add("hidden");
}

async function fetchApi(params) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}?${query}`);
  const data = await res.json();
  if (!res.ok || data.errorCode) {
    throw new Error(data.errorMessage || data.error || "API 요청에 실패했습니다.");
  }
  return data;
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, "").toLowerCase();
}

function truncate(text, max = 120) {
  if (!text) return "줄거리 정보가 없어요 📭";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function getItemPage(item) {
  return item.subInfo?.itemPage || null;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const GENERIC_CATEGORIES = new Set(["국내도서", "외국도서", "eBook", "음반", "DVD"]);

function splitCategorySegments(path) {
  return path
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !GENERIC_CATEGORIES.has(s));
}

function getTopCategories(item, limit = 3) {
  const paths = item.categoryIdList?.length
    ? item.categoryIdList.map((c) => c.categoryName)
    : item.categoryName
      ? [item.categoryName]
      : [];

  if (!paths.length) return [];

  const freq = new Map();
  paths.forEach((path) => {
    splitCategorySegments(path).forEach((segment) => {
      freq.set(segment, (freq.get(segment) || 0) + 1);
    });
  });

  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);

  if (ranked.length) {
    return ranked.slice(0, limit).map(([name]) => name);
  }

  const fallback = splitCategorySegments(paths[0]);
  return fallback.slice(-limit);
}

function formatCategoryHtml(item) {
  const top = getTopCategories(item);
  if (!top.length) return "분류 정보 없음";

  return top
    .map((cat, i) => (i === 0 ? escapeHtml(cat) : `· ${escapeHtml(cat)}`))
    .join("<br>");
}

/* ===== Bestseller Slider ===== */
async function loadBestsellers() {
  showLoading();
  try {
    const data = await fetchApi({ action: "bestseller", maxResults: "15" });
    bestsellerItems = data.item || [];
    renderBestsellerSlider();
  } catch (err) {
    $("#bestseller-track").innerHTML = `
      <div class="empty-message">😢 베스트셀러를 불러오지 못했어요<br>${escapeHtml(err.message)}</div>
    `;
  } finally {
    hideLoading();
  }
}

function renderBestsellerSlider() {
  const track = $("#bestseller-track");
  const dots = $("#bestseller-dots");

  if (!bestsellerItems.length) {
    track.innerHTML = `<div class="empty-message">📭 베스트셀러 목록이 비어 있어요</div>`;
    return;
  }

  track.innerHTML = bestsellerItems
    .map((item, i) => {
      const page = getItemPage(item);
      const pageText = page ? `${page}쪽 📄` : `출간: ${item.pubDate || "미정"} 📅`;
      return `
        <article class="bestseller-card card-3d clickable" data-item-id="${item.itemId}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)} 상세보기">
          <div class="bestseller-cover-wrap">
            <span class="bestseller-rank">${item.bestRank || i + 1}</span>
            <img class="bestseller-cover" src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)} 표지" loading="lazy">
          </div>
          <div class="bestseller-info">
            <h3>${escapeHtml(item.title)}</h3>
            <div class="bestseller-meta">
              <span class="meta-badge">✍️ ${escapeHtml(item.author)}</span>
              <span class="meta-badge">${pageText}</span>
            </div>
            <p class="bestseller-desc">${escapeHtml(truncate(item.description, 200))}</p>
            <button type="button" class="view-btn" data-item-id="${item.itemId}">자세히 보기 👀</button>
          </div>
        </article>
      `;
    })
    .join("");

  dots.innerHTML = bestsellerItems
    .map((_, i) => `<button type="button" class="slider-dot${i === 0 ? " active" : ""}" data-index="${i}" aria-label="${i + 1}번째 책"></button>`)
    .join("");

  currentSlide = 0;
  updateSliderPosition();
  bindBestsellerEvents();
}

function updateSliderPosition() {
  $("#bestseller-track").style.transform = `translateX(-${currentSlide * 100}%)`;
  $$(".slider-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === currentSlide);
  });
}

function bindBestsellerEvents() {
  $("#bestseller-prev").onclick = () => {
    if (bestsellerItems.length === 0) return;
    currentSlide = (currentSlide - 1 + bestsellerItems.length) % bestsellerItems.length;
    updateSliderPosition();
  };

  $("#bestseller-next").onclick = () => {
    if (bestsellerItems.length === 0) return;
    currentSlide = (currentSlide + 1) % bestsellerItems.length;
    updateSliderPosition();
  };

  $$(".slider-dot").forEach((dot) => {
    dot.onclick = () => {
      currentSlide = Number(dot.dataset.index);
      updateSliderPosition();
    };
  });

  trackClickHandlers("#bestseller-track");
}

/* ===== Search ===== */
function getSearchType() {
  const checked = document.querySelector('input[name="searchType"]:checked');
  return checked ? checked.value : "Keyword";
}

function updateSearchUI() {
  const type = getSearchType();
  $("#search-emoji").textContent = SEARCH_EMOJIS[type];
  $("#search-input").placeholder = SEARCH_PLACEHOLDERS[type];
}

async function handleSearch(e) {
  e.preventDefault();
  const query = $("#search-input").value.trim();
  if (!query) return;

  const searchType = getSearchType();
  showLoading();

  try {
    const data = await fetchApi({
      action: "search",
      query,
      queryType: searchType,
      maxResults: "30",
    });

    const items = data.item || [];
    renderSearchResults(items, query, searchType);
    $("#results-section").classList.remove("hidden");
    $("#results-section").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    $("#results-container").innerHTML = `
      <div class="empty-message">😢 검색에 실패했어요<br>${escapeHtml(err.message)}</div>
    `;
    $("#results-section").classList.remove("hidden");
  } finally {
    hideLoading();
  }
}

function renderSearchResults(items, query, searchType) {
  const container = $("#results-container");

  if (!items.length) {
    container.innerHTML = `<div class="empty-message">🔍 "${escapeHtml(query)}"에 대한 결과가 없어요</div>`;
    return;
  }

  if (searchType === "Keyword") {
    const normalizedQuery = normalizeText(query);
    const exactMatches = items.filter((item) => normalizeText(item.title) === normalizedQuery);
    const relatedBooks = items.filter((item) => normalizeText(item.title) !== normalizedQuery);

    let html = "";

    html += `<div class="results-group">
      <h3 class="results-group-title">🎯 키워드 완전 일치 도서 (${exactMatches.length}권)</h3>`;
    html += exactMatches.length
      ? `<div class="results-grid">${exactMatches.map(renderResultCard).join("")}</div>`
      : `<div class="empty-message">완전히 일치하는 도서명이 없어요 🤔</div>`;
    html += `</div>`;

    html += `<div class="results-group">
      <h3 class="results-group-title">💡 관련 도서 (${relatedBooks.length}권)</h3>`;
    html += relatedBooks.length
      ? `<div class="results-grid">${relatedBooks.map(renderResultCard).join("")}</div>`
      : `<div class="empty-message">관련 도서가 없어요</div>`;
    html += `</div>`;

    container.innerHTML = html;
  } else {
    const label = searchType === "Title" ? "📕 도서명" : "✍️ 저자명";
    container.innerHTML = `
      <div class="results-group">
        <h3 class="results-group-title">${label} 검색 결과 (${items.length}권)</h3>
        <div class="results-grid">${items.map(renderResultCard).join("")}</div>
      </div>
    `;
  }

  trackClickHandlers("#results-container");
}

function renderResultCard(item) {
  return `
    <article class="result-card card-3d clickable" data-item-id="${item.itemId}">
      <img class="result-cover" src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)} 표지" loading="lazy">
      <h4>${escapeHtml(item.title)}</h4>
      <p class="result-author">✍️ ${escapeHtml(item.author)}</p>
      <p class="result-desc">${escapeHtml(truncate(item.description))}</p>
      <button type="button" class="view-btn" data-item-id="${item.itemId}">상세보기 📖</button>
    </article>
  `;
}

function trackClickHandlers(containerSel) {
  const container = $(containerSel);
  if (!container) return;

  container.querySelectorAll("[data-item-id]").forEach((el) => {
    const itemId = el.dataset.itemId;
    if (!itemId) return;

    const open = () => openBookDetail(itemId);

    if (el.classList.contains("clickable") && el.tagName !== "BUTTON") {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".view-btn")) return;
        open();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    }
  });

  container.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openBookDetail(btn.dataset.itemId);
    });
  });
}

/* ===== Book Detail (ItemLookUp API) ===== */
async function openBookDetail(itemId) {
  showLoading();
  try {
    const data = await fetchApi({ action: "lookup", itemId });
    const item = data.item?.[0];
    if (!item) throw new Error("도서 정보를 찾을 수 없습니다.");

    renderDetailModal(item);
    $("#detail-modal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
  } catch (err) {
    alert(`😢 도서 정보를 불러오지 못했어요: ${err.message}`);
  } finally {
    hideLoading();
  }
}

function renderDetailModal(item) {
  const categoriesHtml = formatCategoryHtml(item);
  const description = item.description || "줄거리 정보가 없어요 📭";
  const page = getItemPage(item);

  $("#detail-content").innerHTML = `
    <div class="detail-layout card-3d" style="box-shadow:none;border:none;padding:0;">
      <img class="detail-cover" src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)} 표지">
      <div class="detail-info">
        <h2 id="detail-title">📖 ${escapeHtml(item.title)}</h2>
        <div class="detail-meta">
          <div class="detail-meta-item"><strong>✍️ 저자</strong><span>${escapeHtml(item.author)}</span></div>
          <div class="detail-meta-item"><strong>🏢 출판</strong><span>${escapeHtml(item.publisher || "정보 없음")}</span></div>
          ${page ? `<div class="detail-meta-item"><strong>📄 페이지</strong><span>${page}쪽</span></div>` : ""}
          <div class="detail-meta-item"><strong>📅 출간</strong><span>${escapeHtml(item.pubDate || "미정")}</span></div>
        </div>
        <div class="detail-category">🏷️<br>${categoriesHtml}</div>
        <div class="detail-desc">
          <strong>📝 줄거리</strong><br><br>
          ${escapeHtml(description)}
        </div>
      </div>
    </div>
  `;
}

function closeModal() {
  $("#detail-modal").classList.add("hidden");
  document.body.style.overflow = "";
}

/* ===== Init ===== */
function init() {
  $$('input[name="searchType"]').forEach((radio) => {
    radio.addEventListener("change", updateSearchUI);
  });

  $("#search-form").addEventListener("submit", handleSearch);
  $("#modal-close").addEventListener("click", closeModal);
  $("#detail-modal").addEventListener("click", (e) => {
    if (e.target === $("#detail-modal")) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  updateSearchUI();
  loadBestsellers();
}

document.addEventListener("DOMContentLoaded", init);
