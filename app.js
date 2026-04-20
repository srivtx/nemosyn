import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";

const papers = Array.isArray(window.papers) ? window.papers : [];

const papersList = document.getElementById("papers-list");
const paperSearch = document.getElementById("paper-search");
const viewerPlaceholder = document.getElementById("viewer-placeholder");
const viewerSection = document.querySelector(".viewer-section");
const canvasFrame = document.getElementById("canvas-frame");
const canvas = document.getElementById("pdf-canvas");
const currentPaperTitle = document.getElementById("current-paper-title");

const prevPageButton = document.getElementById("prev-page");
const nextPageButton = document.getElementById("next-page");
const pageInput = document.getElementById("page-input");
const pageCount = document.getElementById("page-count");
const zoomOutButton = document.getElementById("zoom-out");
const zoomInButton = document.getElementById("zoom-in");
const zoomResetButton = document.getElementById("zoom-reset");
const zoomLevel = document.getElementById("zoom-level");

const state = {
  activePaperId: null,
  pdfDocument: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1,
  token: 0,
};

const MIN_SCALE = 0.6;
const MAX_SCALE = 3;
const SCALE_STEP = 0.15;
const DEFAULT_SCALE = 1;

function setStatus(message) {
  viewerPlaceholder.textContent = message;
  viewerPlaceholder.classList.remove("hidden");
  canvasFrame.classList.add("hidden");
}

function showCanvas() {
  viewerPlaceholder.classList.add("hidden");
  canvasFrame.classList.remove("hidden");
}

function handleReaderWheel(event) {
  if (!state.pdfDocument) {
    return;
  }

  const frame = canvasFrame;
  const canScroll = frame.scrollHeight > frame.clientHeight;
  if (!canScroll) {
    return;
  }

  const atTop = frame.scrollTop <= 0;
  const atBottom = frame.scrollTop + frame.clientHeight >= frame.scrollHeight - 1;
  const scrollingDown = event.deltaY > 0;
  const scrollingUp = event.deltaY < 0;

  if ((scrollingDown && !atBottom) || (scrollingUp && !atTop)) {
    event.preventDefault();
    frame.scrollTop += event.deltaY;
  }
}

function updateControls() {
  const hasDoc = Boolean(state.pdfDocument);
  prevPageButton.disabled = !hasDoc || state.currentPage <= 1;
  nextPageButton.disabled = !hasDoc || state.currentPage >= state.totalPages;
  pageInput.disabled = !hasDoc;
  zoomOutButton.disabled = !hasDoc || state.scale <= MIN_SCALE;
  zoomInButton.disabled = !hasDoc || state.scale >= MAX_SCALE;
  zoomResetButton.disabled = !hasDoc;
  pageInput.value = String(state.currentPage || 1);
  pageInput.max = String(state.totalPages || 1);
  pageCount.textContent = `/ ${state.totalPages || 0}`;
  zoomLevel.textContent = `${Math.round(state.scale * 100)}%`;
}

async function destroyCurrentDocument() {
  if (!state.pdfDocument) {
    return;
  }

  const oldDoc = state.pdfDocument;
  state.pdfDocument = null;
  await oldDoc.destroy();
}

async function renderCurrentPage(token) {
  if (!state.pdfDocument) {
    return;
  }

  const page = await state.pdfDocument.getPage(state.currentPage);
  if (token !== state.token) {
    return;
  }

  const baseViewport = page.getViewport({ scale: 1 });
  const frameWidth =
    canvasFrame.clientWidth ||
    (viewerSection ? viewerSection.clientWidth - 36 : window.innerWidth - 40);
  const targetWidth = Math.max(frameWidth - 28, 280);
  const fitScale = targetWidth / baseViewport.width;
  const renderScale = fitScale * state.scale;
  const viewport = page.getViewport({ scale: renderScale });
  const context = canvas.getContext("2d");
  const pixelRatio = window.devicePixelRatio || 1;

  canvas.width = Math.floor(viewport.width * pixelRatio);
  canvas.height = Math.floor(viewport.height * pixelRatio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  await page.render({ canvasContext: context, viewport }).promise;
  if (token !== state.token) {
    return;
  }

  showCanvas();
  updateControls();
}

async function openPaper(paper) {
  state.token += 1;
  const openToken = state.token;

  setStatus("Loading PDF...");
  state.activePaperId = paper.id;
  currentPaperTitle.textContent = paper.title;
  state.currentPage = 1;
  state.scale = DEFAULT_SCALE;
  updateControls();
  renderPapers(filterPapers(paperSearch.value.trim()));

  await destroyCurrentDocument();

  const loadingTask = pdfjsLib.getDocument(paper.pdfPath);
  const documentRef = await loadingTask.promise;
  if (openToken !== state.token) {
    await documentRef.destroy();
    return;
  }

  state.pdfDocument = documentRef;
  state.totalPages = documentRef.numPages;
  updateControls();
  await renderCurrentPage(openToken);
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
      setStatus("Could not load this PDF.");
      updateControls();
    });
  });

  card.append(title, description, button);
  return card;
}

function filterPapers(query) {
  if (!query) {
    return papers;
  }

  const normalizedQuery = query.toLowerCase();
  return papers.filter((paper) => {
    return (
      paper.title.toLowerCase().includes(normalizedQuery) ||
      paper.description.toLowerCase().includes(normalizedQuery)
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

function goToPage(pageNumber) {
  if (!state.pdfDocument) {
    return;
  }

  const nextPage = Math.min(Math.max(pageNumber, 1), state.totalPages);
  state.currentPage = nextPage;
  updateControls();
  renderCurrentPage(state.token).catch(() => {
    setStatus("Could not render this page.");
  });
}

function setScale(nextScale) {
  if (!state.pdfDocument) {
    return;
  }

  const clampedScale = Math.min(Math.max(nextScale, MIN_SCALE), MAX_SCALE);
  state.scale = clampedScale;
  updateControls();
  renderCurrentPage(state.token).catch(() => {
    setStatus("Could not apply zoom.");
  });
}

paperSearch.addEventListener("input", (event) => {
  renderPapers(filterPapers(event.target.value.trim()));
});

prevPageButton.addEventListener("click", () => goToPage(state.currentPage - 1));
nextPageButton.addEventListener("click", () => goToPage(state.currentPage + 1));
pageInput.addEventListener("change", () => {
  const requestedPage = Number(pageInput.value);
  goToPage(Number.isFinite(requestedPage) ? requestedPage : state.currentPage);
});

zoomOutButton.addEventListener("click", () => setScale(state.scale - SCALE_STEP));
zoomInButton.addEventListener("click", () => setScale(state.scale + SCALE_STEP));
zoomResetButton.addEventListener("click", () => setScale(DEFAULT_SCALE));
canvasFrame.addEventListener("wheel", handleReaderWheel, { passive: false });

let resizeTimer;
window.addEventListener("resize", () => {
  if (!state.pdfDocument) {
    return;
  }

  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderCurrentPage(state.token).catch(() => {
      setStatus("Could not resize PDF view.");
    });
  }, 120);
});

setStatus("Select a paper to start reading.");
updateControls();
renderPapers(papers);
