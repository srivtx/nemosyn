import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";

const papers = Array.isArray(window.papers) ? window.papers : [];

const papersList = document.getElementById("papers-list");
const paperSearch = document.getElementById("paper-search");

const readerModal = document.getElementById("reader-modal");
const closeReaderButton = document.getElementById("close-reader");
const modalPaperTitle = document.getElementById("modal-paper-title");
const pageProgress = document.getElementById("page-progress");
const readerStatus = document.getElementById("reader-status");
const readerScroll = document.getElementById("reader-scroll");
const pdfPages = document.getElementById("pdf-pages");
const zoomOutButton = document.getElementById("zoom-out");
const zoomInButton = document.getElementById("zoom-in");
const zoomResetButton = document.getElementById("zoom-reset");
const zoomLevel = document.getElementById("zoom-level");

const state = {
  activePaperId: null,
  currentPaper: null,
  pdfDocument: null,
  renderToken: 0,
  autoScale: 1,
  zoomFactor: 1,
  totalPages: 0,
  currentVisiblePage: 1,
};

const MIN_ZOOM_FACTOR = 0.6;
const MAX_ZOOM_FACTOR = 2.4;
const ZOOM_STEP = 0.12;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateZoomLabel() {
  const effectiveScale = state.autoScale * state.zoomFactor;
  zoomLevel.textContent = `${Math.round(effectiveScale * 100)}%`;
}

function updatePageProgress() {
  if (!state.pdfDocument) {
    pageProgress.textContent = "";
    return;
  }

  pageProgress.textContent = `Page ${state.currentVisiblePage} of ${state.totalPages}`;
}

function updateReaderControls() {
  const hasDoc = Boolean(state.pdfDocument);
  zoomOutButton.disabled = !hasDoc || state.zoomFactor <= MIN_ZOOM_FACTOR;
  zoomInButton.disabled = !hasDoc || state.zoomFactor >= MAX_ZOOM_FACTOR;
  zoomResetButton.disabled = !hasDoc;
  updateZoomLabel();
  updatePageProgress();
}

function setReaderStatus(message) {
  readerStatus.textContent = message;
  readerStatus.classList.remove("hidden");
  pdfPages.classList.add("hidden");
}

function showRenderedPages() {
  readerStatus.classList.add("hidden");
  pdfPages.classList.remove("hidden");
}

async function destroyCurrentDocument() {
  if (!state.pdfDocument) {
    return;
  }

  const oldDoc = state.pdfDocument;
  state.pdfDocument = null;
  state.totalPages = 0;
  await oldDoc.destroy();
}

async function computeAutoScale() {
  if (!state.pdfDocument) {
    return 1;
  }

  const firstPage = await state.pdfDocument.getPage(1);
  const baseViewport = firstPage.getViewport({ scale: 1 });
  const availableWidth = Math.max(readerScroll.clientWidth - 42, 240);
  const availableHeight = Math.max(readerScroll.clientHeight - 32, 240);
  const widthScale = availableWidth / baseViewport.width;
  const heightScale = availableHeight / baseViewport.height;
  return clamp(Math.min(widthScale, heightScale), 0.45, 2.2);
}

async function renderAllPages(options = {}) {
  if (!state.pdfDocument) {
    return;
  }

  const { preserveScroll = false } = options;
  const token = ++state.renderToken;

  const previousRatio =
    preserveScroll && readerScroll.scrollHeight > readerScroll.clientHeight
      ? readerScroll.scrollTop / (readerScroll.scrollHeight - readerScroll.clientHeight)
      : 0;

  state.autoScale = await computeAutoScale();
  const renderScale = clamp(state.autoScale * state.zoomFactor, 0.35, 4);
  updateReaderControls();

  setReaderStatus("Rendering pages...");
  pdfPages.innerHTML = "";

  const pixelRatio = window.devicePixelRatio || 1;

  for (let pageNumber = 1; pageNumber <= state.totalPages; pageNumber += 1) {
    if (token !== state.renderToken) {
      return;
    }

    const page = await state.pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: renderScale });

    const pageWrap = document.createElement("section");
    pageWrap.className = "pdf-page-wrap";
    pageWrap.dataset.page = String(pageNumber);

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-canvas";
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const context = canvas.getContext("2d");
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    pageWrap.appendChild(canvas);
    pdfPages.appendChild(pageWrap);

    await page.render({ canvasContext: context, viewport }).promise;
  }

  if (token !== state.renderToken) {
    return;
  }

  showRenderedPages();

  if (preserveScroll && readerScroll.scrollHeight > readerScroll.clientHeight) {
    const nextTop = previousRatio * (readerScroll.scrollHeight - readerScroll.clientHeight);
    readerScroll.scrollTop = nextTop;
  } else {
    readerScroll.scrollTop = 0;
  }

  state.currentVisiblePage = 1;
  updateCurrentPageByScroll();
  updateReaderControls();
}

function updateCurrentPageByScroll() {
  if (!state.pdfDocument) {
    return;
  }

  const pageNodes = pdfPages.querySelectorAll(".pdf-page-wrap");
  if (pageNodes.length === 0) {
    return;
  }

  const targetY = readerScroll.scrollTop + readerScroll.clientHeight * 0.22;
  let closestPage = 1;
  let closestDistance = Number.POSITIVE_INFINITY;

  pageNodes.forEach((node, index) => {
    const distance = Math.abs(node.offsetTop - targetY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestPage = index + 1;
    }
  });

  if (closestPage !== state.currentVisiblePage) {
    state.currentVisiblePage = closestPage;
    updatePageProgress();
  }
}

function openReaderModal() {
  readerModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

async function closeReaderModal() {
  readerModal.classList.add("hidden");
  document.body.style.overflow = "";
  pdfPages.innerHTML = "";
  state.currentPaper = null;
  state.activePaperId = null;
  await destroyCurrentDocument();
  renderPapers(filterPapers(paperSearch.value.trim()));
}

async function openPaper(paper) {
  openReaderModal();
  state.activePaperId = paper.id;
  state.currentPaper = paper;
  state.zoomFactor = 1;
  modalPaperTitle.textContent = paper.title;
  pageProgress.textContent = "";
  renderPapers(filterPapers(paperSearch.value.trim()));
  setReaderStatus("Loading PDF...");
  updateReaderControls();

  await destroyCurrentDocument();

  const token = ++state.renderToken;
  const loadingTask = pdfjsLib.getDocument(paper.pdfPath);
  const documentRef = await loadingTask.promise;

  if (token !== state.renderToken) {
    await documentRef.destroy();
    return;
  }

  state.pdfDocument = documentRef;
  state.totalPages = documentRef.numPages;
  state.currentVisiblePage = 1;
  await renderAllPages();
}

function createPaperCard(paper) {
  const card = document.createElement("article");
  card.className = "paper-card";
  if (paper.id === state.activePaperId) {
    card.classList.add("is-active");
  }

  const title = document.createElement("h3");
  title.textContent = paper.title;

  const description = document.createElement("p");
  description.textContent = paper.description;

  const button = document.createElement("button");
  button.className = "read-button";
  button.type = "button";
  button.textContent = "Read";
  button.addEventListener("click", () => {
    openPaper(paper).catch(() => {
      setReaderStatus("Could not load this PDF.");
      updateReaderControls();
    });
  });

  card.append(title, description, button);
  return card;
}

function filterPapers(query) {
  if (!query) {
    return papers;
  }

  const q = query.toLowerCase();
  return papers.filter((paper) => {
    return (
      paper.title.toLowerCase().includes(q) ||
      paper.description.toLowerCase().includes(q)
    );
  });
}

function renderPapers(list) {
  papersList.innerHTML = "";
  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "meta-text";
    empty.textContent = "No papers match your search.";
    papersList.appendChild(empty);
    return;
  }

  list.forEach((paper) => papersList.appendChild(createPaperCard(paper)));
}

paperSearch.addEventListener("input", (event) => {
  renderPapers(filterPapers(event.target.value.trim()));
});

zoomOutButton.addEventListener("click", () => {
  if (!state.pdfDocument) {
    return;
  }

  state.zoomFactor = clamp(state.zoomFactor - ZOOM_STEP, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
  renderAllPages({ preserveScroll: true }).catch(() => {
    setReaderStatus("Could not apply zoom.");
  });
});

zoomInButton.addEventListener("click", () => {
  if (!state.pdfDocument) {
    return;
  }

  state.zoomFactor = clamp(state.zoomFactor + ZOOM_STEP, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
  renderAllPages({ preserveScroll: true }).catch(() => {
    setReaderStatus("Could not apply zoom.");
  });
});

zoomResetButton.addEventListener("click", () => {
  if (!state.pdfDocument) {
    return;
  }

  state.zoomFactor = 1;
  renderAllPages({ preserveScroll: true }).catch(() => {
    setReaderStatus("Could not reset zoom.");
  });
});

closeReaderButton.addEventListener("click", () => {
  closeReaderModal().catch(() => {});
});

readerModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-modal]")) {
    closeReaderModal().catch(() => {});
  }
});

readerScroll.addEventListener("scroll", updateCurrentPageByScroll, { passive: true });

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !readerModal.classList.contains("hidden")) {
    closeReaderModal().catch(() => {});
  }
});

let resizeTimer;
window.addEventListener("resize", () => {
  if (!state.pdfDocument || readerModal.classList.contains("hidden")) {
    return;
  }

  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderAllPages({ preserveScroll: true }).catch(() => {
      setReaderStatus("Could not resize pages.");
    });
  }, 150);
});

setReaderStatus("Loading PDF...");
updateReaderControls();
renderPapers(papers);
