const papersList = document.getElementById("papers-list");
const pdfViewer = document.getElementById("pdf-viewer");
const viewerPlaceholder = document.getElementById("viewer-placeholder");

function openPaper(paper) {
  pdfViewer.src = paper.pdfPath;
  pdfViewer.classList.remove("hidden");
  viewerPlaceholder.classList.add("hidden");
}

function createPaperCard(paper) {
  const card = document.createElement("article");
  card.className = "paper-card";

  const title = document.createElement("h3");
  title.textContent = paper.title;

  const description = document.createElement("p");
  description.textContent = paper.description;

  const button = document.createElement("button");
  button.className = "read-button";
  button.type = "button";
  button.textContent = "Read";
  button.addEventListener("click", () => openPaper(paper));

  card.appendChild(title);
  card.appendChild(description);
  card.appendChild(button);
  return card;
}

function renderPapers(list) {
  papersList.innerHTML = "";
  list.forEach((paper) => papersList.appendChild(createPaperCard(paper)));
}

renderPapers(papers);
