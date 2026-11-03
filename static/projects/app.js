const projectsEl = document.querySelector("#projects");
const detailTemplate = document.querySelector("#projectTemplate");
const form = document.querySelector("#projectForm");
const projectFormPanel = document.querySelector("#projectFormPanel");
const studyFormPanel = document.querySelector("#studyFormPanel");
const studyForm = document.querySelector("#studyForm");
const settingsForm = document.querySelector("#settingsForm");
const settingsModal = document.querySelector("#settingsModal");
const helpModal = document.querySelector("#helpModal");
const openHelpButton = document.querySelector("#openHelpButton");
const closeHelpButton = document.querySelector("#closeHelpButton");
const openSettingsButton = document.querySelector("#openSettingsButton");
const closeSettingsButton = document.querySelector("#closeSettingsButton");
const showProjectFormButton = document.querySelector("#showProjectFormButton");
const hideProjectFormButton = document.querySelector("#hideProjectFormButton");
const showStudyFormButton = document.querySelector("#showStudyFormButton");
const hideStudyFormButton = document.querySelector("#hideStudyFormButton");
const refreshButton = document.querySelector("#refreshButton");
const exportDashboardButton = document.querySelector("#exportDashboardButton");
const executiveReport = document.querySelector("#executiveReport");
const lastUpdate = document.querySelector("#lastUpdate");
const dashboardTitle = document.querySelector("#dashboard-title");
const reportModal = document.querySelector("#reportModal");
const reportSubject = document.querySelector("#reportSubject");
const reportBody = document.querySelector("#reportBody");
const copyReportButton = document.querySelector("#copyReportButton");
const closeReportButton = document.querySelector("#closeReportButton");
const notesModal = document.querySelector("#notesModal");
const projectNotes = document.querySelector("#projectNotes");
const closeNotesButton = document.querySelector("#closeNotesButton");
const saveNotesButton = document.querySelector("#saveNotesButton");
const managerAssistantPanel = document.querySelector("#projectManagerAssistant");
const managerAssistantMessages = document.querySelector("#managerAssistantMessages");
const managerAssistantForm = document.querySelector("#managerAssistantForm");
const managerAssistantInput = document.querySelector("#managerAssistantInput");
const managerAssistantSend = document.querySelector("#managerAssistantSend");
let managerAssistantProjectId = null;
let managerAssistantBusy = false;
let managerAssistantHistory = [];
let managerAssistantStatusPromise = Promise.resolve({ provider: "interno", model: "" });
document.addEventListener("project-identity-loaded", () => {
  if (!isProjectManagerAdmin()) managerAssistantPanel.hidden = true;
});
const studyEditModal = document.querySelector("#studyEditModal");
const studyEditForm = document.querySelector("#studyEditForm");
const studyEditName = document.querySelector("#studyEditName");
const studyEditDescription = document.querySelector("#studyEditDescription");
const studyEditDescriptionField = document.querySelector("#studyEditDescriptionField");
const closeStudyEditButton = document.querySelector("#closeStudyEditButton");
const attentionDelayInput = document.querySelector("#attentionDelayInput");
const negativeVarianceInput = document.querySelector("#negativeVarianceInput");
const criteriaDescription = document.querySelector("#criteriaDescription");
const workPlanImageInput = document.querySelector("#workPlanImageInput");
const workPlanUploadStatus = document.querySelector("#workPlanUploadStatus");
const deleteWorkPlanImageButton = document.querySelector("#deleteWorkPlanImageButton");
const workItemModal = document.querySelector("#workItemModal");
const workItemForm = document.querySelector("#workItemForm");
const workItemModalTitle = document.querySelector("#workItemModalTitle");
const workItemType = document.querySelector("#workItemType");
const workItemStatus = document.querySelector("#workItemStatus");
const workItemParentField = document.querySelector("#workItemParentField");
const workItemParentLabel = document.querySelector("#workItemParentLabel");
const workItemParent = document.querySelector("#workItemParent");
const workItemTitle = document.querySelector("#workItemTitle");
const workItemDescription = document.querySelector("#workItemDescription");
const workItemDescriptionToolbar = document.querySelector("#workItemDescriptionToolbar");
const workItemDescriptionContent = document.querySelector("#workItemDescriptionContent");
const sourceCodeLinksList = document.querySelector("#sourceCodeLinksList");
const addSourceCodeLinkButton = document.querySelector("#addSourceCodeLink");
const closeWorkItemButton = document.querySelector("#closeWorkItemButton");
const deleteWorkItemButton = document.querySelector("#deleteWorkItemButton");
const projectUiState = new Map();
const appBasePath = document.documentElement.dataset.basePath || "";
const WORK_ITEM_VIEW_STORAGE_KEY = "projects:workItemView";
const PREFERRED_WORK_ITEM_VIEWS = new Set(["list", "status", "kanban"]);
let editorSourceCodeLinks = [];

function workItemViewStorageKey() {
  const userId = authState.user?.id || "anonymous";
  return `${WORK_ITEM_VIEW_STORAGE_KEY}:${userId}`;
}

function getStoredWorkItemView() {
  try {
    const saved = localStorage.getItem(workItemViewStorageKey()) || localStorage.getItem(WORK_ITEM_VIEW_STORAGE_KEY);
    return PREFERRED_WORK_ITEM_VIEWS.has(saved) ? saved : "list";
  } catch {
    return "list";
  }
}

function setStoredWorkItemView(view) {
  if (!PREFERRED_WORK_ITEM_VIEWS.has(view)) return;
  try {
    localStorage.setItem(workItemViewStorageKey(), view);
  } catch {
    /* localStorage indisponível (modo privado etc.) — preferência não persiste nesta sessão */
  }
}
const scheduleUpdateInput = document.createElement("input");
scheduleUpdateInput.type = "file";
scheduleUpdateInput.accept = ".xml,.mpp,.mpt";
scheduleUpdateInput.hidden = true;
document.body.appendChild(scheduleUpdateInput);

let projectsCache = [];
let projectSettings = { attentionDelayPercent: 10, negativeVarianceAttention: false };
let notesProjectId = null;
let studyEditProjectId = null;
let editingProject = null;
let scheduleUpdateProjectId = null;
let selectedProjectId = localStorage.getItem("selectedProjectId") || null;
let draggedDashboardCard = null;
let draggedDashboardSection = null;
let percentageAlignmentFrame = null;
let dashboardProjectFilter = "active";
let editingWorkItemId = null;
let editingWorkItemRev = 0;
let workItemProjectId = null;
let pendingWorkItemStage = null;
const dashboardOrderKey = "ecargo.projects.dashboardOrder";
const dashboardCollapsedKey = "ecargo.projects.dashboardCollapsed";
const dashboardGroupOrderKey = "ecargo.projects.dashboardGroupOrder";
const defaultDashboardGroupOrder = ["work-plan", "projects", "studies"];
const workItemTypes = {
  requirement: "Análise de Requisitos",
  "technical-definition": "Definição Técnica",
  bug: "Bug",
};
const workItemStatuses = {
  requirement: { backlog: "Não iniciada", analysis: "Em análise", approved: "Aprovada", blocked: "Bloqueada" },
  "technical-definition": { backlog: "Não iniciada", definition: "Em definição", "ready-for-test": "Pronta para teste", testing: "Em teste", done: "Concluída", blocked: "Bloqueada" },
  bug: { open: "Aberto", fixing: "Em correção", "ready-for-retest": "Pronto para reteste", blocked: "Bloqueado", closed: "Fechado" },
};

function formatDate(value, withTime = false) {
  if (!value) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: withTime ? "short" : undefined,
  }).format(new Date(value));
}

function plannedPercentByDate(startValue, finishValue, referenceDate = new Date()) {
  if (!startValue || !finishValue) return 0;

  const start = new Date(startValue);
  const finish = new Date(finishValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) return 0;
  if (referenceDate <= start) return 0;
  if (referenceDate >= finish) return 100;

  const duration = finish.getTime() - start.getTime();
  if (duration <= 0) return 100;
  return Math.round(((referenceDate.getTime() - start.getTime()) / duration) * 100);
}

function plannedPercentFromTasks(tasks = []) {
  if (!tasks.length) return 0;
  const total = tasks.reduce((sum, task) => {
    return sum + (task.plannedPercent ?? plannedPercentByDate(task.start, task.finish));
  }, 0);
  return Math.round(total / tasks.length);
}

function setText(root, field, value) {
  root.querySelector(`[data-field="${field}"]`).textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function restoreInlineTokens(value, tokens) {
  return value.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] || "");
}

function renderInlineMarkdown(value) {
  const tokens = [];
  const token = (html) => {
    tokens.push(html);
    return `\u0000${tokens.length - 1}\u0000`;
  };
  let text = String(value ?? "");

  text = text.replace(/\\([\\`*_{}\[\]()#+.!>|~\-])/g, (_, character) => token(escapeHtml(character)));
  text = text.replace(/`([^`]+)`/g, (_, code) => token(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, (_, alt, src) => {
    return token(`<img class="markdown-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />`);
  });
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, href) => {
    return token(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${renderInlineMarkdown(label)}</a>`);
  });

  text = escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return restoreInlineTokens(text, tokens);
}

function renderMarkdown(value) {
  const lines = String(value ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length + 2;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      flushParagraph();
      const quoteLines = [];
      while (index < lines.length && /^>\s+/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s+/, ""));
        index += 1;
      }
      index -= 1;
      blocks.push(`<blockquote>${quoteLines.map(renderInlineMarkdown).join("<br>")}</blockquote>`);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph();
      const items = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ""));
        index += 1;
      }
      index -= 1;
      blocks.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      index -= 1;
      blocks.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks.join("");
}

function markdownBlock(value, fallback = "") {
  return renderMarkdown(String(value || fallback));
}

function applyMarkdownFormat(textarea, action) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);

  const replaceSelection = (next, cursorStart = start, cursorEnd = start + next.length) => {
    textarea.value = `${value.slice(0, start)}${next}${value.slice(end)}`;
    textarea.focus();
    textarea.setSelectionRange(cursorStart, cursorEnd);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const wrap = (before, after, sample) => {
    const content = selected || sample;
    replaceSelection(`${before}${content}${after}`, start + before.length, start + before.length + content.length);
  };

  const prefixLines = (prefix) => {
    const target = selected || "";
    const lines = target ? target.split("\n") : [""];
    const next = lines.map((line) => line.startsWith(prefix) ? line : `${prefix}${line}`).join("\n");
    replaceSelection(next, start, start + next.length);
  };

  if (action === "bold") wrap("**", "**", "texto");
  if (action === "italic") wrap("*", "*", "texto");
  if (action === "code") wrap("`", "`", "codigo");
  if (action === "heading") prefixLines("### ");
  if (action === "list") prefixLines("- ");
  if (action === "link") {
    const href = window.prompt("URL do link");
    if (!href) return;
    const label = selected || "link";
    replaceSelection(`[${label}](${href})`, start + 1, start + 1 + label.length);
  }
}

function insertMarkdownImageAt(textarea, image, start, end) {
  const value = textarea.value;
  const markdown = `![${image.name}](${image.url})`;
  textarea.value = `${value.slice(0, start)}${markdown}${value.slice(end)}`;
  textarea.focus();
  const cursor = start + markdown.length;
  textarea.setSelectionRange(cursor, cursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertMarkdownImage(textarea, image) {
  insertMarkdownImageAt(textarea, image, textarea.selectionStart, textarea.selectionEnd);
}

async function uploadAndInsertMarkdownImage(textarea, file) {
  if (!file) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.disabled = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${appBasePath}/api/work-item-images`, { method: "POST", body: formData });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(body.error || "Nao foi possivel enviar a imagem.");
      return;
    }
    insertMarkdownImageAt(textarea, body, start, end);
  } finally {
    textarea.disabled = false;
  }
}

async function uploadMarkdownImage(textarea, file, button) {
  if (!file) return;
  button.disabled = true;
  try {
    await uploadAndInsertMarkdownImage(textarea, file);
  } finally {
    button.disabled = false;
  }
}

function imageFileFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return null;
  const items = Array.from(dataTransfer.items || []);
  const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
  if (imageItem) return imageItem.getAsFile();
  return Array.from(dataTransfer.files || []).find((file) => file.type.startsWith("image/")) || null;
}

function setupMarkdownEditors() {
  const tools = [
    ["bold", "B", "Negrito"],
    ["italic", "I", "Itálico"],
    ["heading", "#", "Título"],
    ["list", "-", "Lista"],
    ["link", "Link", "Link"],
    ["code", "</>", "Código"],
    ["image", "Img", "Inserir imagem"],
  ];

  document.querySelectorAll("textarea[data-markdown='true']").forEach((textarea) => {
    if (textarea.dataset.markdownReady === "true") return;
    textarea.dataset.markdownReady = "true";
    const toolbar = document.createElement("div");
    toolbar.className = "markdown-toolbar";
    toolbar.setAttribute("aria-label", "Ferramentas de formatação Markdown");
    const formatButtons = [];
    tools.forEach(([action, label, title]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.markdownAction = action;
      button.textContent = label;
      button.title = title;
      button.setAttribute("aria-label", title);
      if (action === "image") {
        button.addEventListener("click", () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/png,image/jpeg,image/webp,image/gif";
          input.addEventListener("change", () => uploadMarkdownImage(textarea, input.files[0], button));
          input.click();
        });
      } else {
        button.addEventListener("click", () => applyMarkdownFormat(textarea, action));
      }
      formatButtons.push(button);
      toolbar.appendChild(button);
    });

    const preview = document.createElement("div");
    preview.className = "markdown-preview markdown-content";
    preview.hidden = true;

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "markdown-preview-toggle";
    previewButton.textContent = "Ver";
    previewButton.title = "Pré-visualizar formatação";
    previewButton.setAttribute("aria-label", "Pré-visualizar formatação");
    previewButton.addEventListener("click", () => {
      const enteringPreview = !textarea.hidden;
      if (enteringPreview) {
        preview.innerHTML = markdownBlock(textarea.value) || `<p class="hint">Nada para pré-visualizar.</p>`;
        textarea.hidden = true;
        preview.hidden = false;
        formatButtons.forEach((button) => { button.disabled = true; });
        previewButton.textContent = "Editar";
        previewButton.title = "Voltar a editar";
      } else {
        textarea.hidden = false;
        preview.hidden = true;
        formatButtons.forEach((button) => { button.disabled = false; });
        previewButton.textContent = "Ver";
        previewButton.title = "Pré-visualizar formatação";
        textarea.focus();
      }
    });
    toolbar.appendChild(previewButton);

    textarea.insertAdjacentElement("beforebegin", toolbar);
    textarea.insertAdjacentElement("afterend", preview);
    textarea._markdownPreview = preview;
    textarea._markdownPreviewButton = previewButton;
    textarea._markdownFormatButtons = formatButtons;

    textarea.addEventListener("paste", (event) => {
      const file = imageFileFromDataTransfer(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      uploadAndInsertMarkdownImage(textarea, file);
    });
    textarea.addEventListener("dragover", (event) => {
      if (imageFileFromDataTransfer(event.dataTransfer)) event.preventDefault();
    });
    textarea.addEventListener("drop", (event) => {
      const file = imageFileFromDataTransfer(event.dataTransfer);
      if (!file) return;
      event.preventDefault();
      uploadAndInsertMarkdownImage(textarea, file);
    });
  });
}

function resetMarkdownPreview(textarea) {
  const preview = textarea?._markdownPreview;
  if (!preview) return;
  textarea.hidden = false;
  preview.hidden = true;
  (textarea._markdownFormatButtons || []).forEach((button) => { button.disabled = false; });
  if (textarea._markdownPreviewButton) {
    textarea._markdownPreviewButton.textContent = "Ver";
    textarea._markdownPreviewButton.title = "Pré-visualizar formatação";
  }
}

let richDescriptionSavedRange = null;
const richDescriptionTools = [
  ["bold", "B", "Negrito", "inline"],
  ["italic", "I", "Itálico", "inline"],
  ["heading", "H3", "Título", "block"],
  ["unorderedList", "• Lista", "Lista com marcadores", "list"],
  ["orderedList", "1. Lista", "Lista numerada", "list"],
  ["blockquote", "Citação", "Citação", "block"],
  ["code", "</>", "Código em linha", "inline"],
  ["link", "Link", "Inserir link", "insert"],
  ["image", "Imagem", "Inserir imagem", "insert"],
];

function safeRichUrl(value, allowRelative = false) {
  const url = String(value || "").trim();
  if (allowRelative && url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url, window.location.href);
    return ["http:", "https:"].includes(parsed.protocol) && /^https?:\/\//i.test(url) ? parsed.href : "";
  } catch {
    return "";
  }
}

function escapeRichMarkdownText(value) {
  return String(value).replace(/([\\`*_{}\[\]()#+.!>|~\-])/g, "\\$1");
}

function richInlineMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return escapeRichMarkdownText(node.nodeValue || "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  const inner = Array.from(node.childNodes).map(richInlineMarkdown).join("");
  if (["b", "strong"].includes(tag)) return `**${inner}**`;
  if (["i", "em"].includes(tag)) return `*${inner}*`;
  if (tag === "span" && /^(bold|[6-9]00)$/.test(node.style.fontWeight)) return `**${inner}**`;
  if (tag === "span" && node.style.fontStyle === "italic") return `*${inner}*`;
  if (tag === "code") return `\`${(node.textContent || "").replaceAll("`", "\\`")}\``;
  if (tag === "br") return "\n";
  if (tag === "img") {
    const src = safeRichUrl(node.getAttribute("src"), true);
    if (!src) return "";
    const alt = String(node.getAttribute("alt") || "imagem").replace(/[\[\]]/g, "");
    return `![${escapeRichMarkdownText(alt)}](${src.replaceAll(" ", "%20")})`;
  }
  if (tag === "a") {
    const href = safeRichUrl(node.getAttribute("href"));
    return href ? `[${inner}](${href.replaceAll(" ", "%20").replaceAll(")", "%29")})` : inner;
  }
  return inner;
}

function richBlockMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return escapeRichMarkdownText(node.nodeValue || "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "ul" || tag === "ol") {
    const items = Array.from(node.children).filter((child) => child.tagName.toLowerCase() === "li");
    return items.map((item, index) => {
      const inlineNodes = Array.from(item.childNodes).filter((child) => !["ul", "ol"].includes(child.tagName?.toLowerCase()));
      const text = inlineNodes.map(richInlineMarkdown).join("").trim();
      return `${tag === "ol" ? `${index + 1}.` : "-"} ${text}`;
    }).join("\n") + "\n\n";
  }
  if (tag === "blockquote") {
    const quote = Array.from(node.childNodes).map(richBlockMarkdown).join("").trim();
    return quote.split("\n").map((line) => `> ${line}`).join("\n") + "\n\n";
  }
  if (/^h[3-5]$/.test(tag)) {
    const level = Number(tag.slice(1)) - 2;
    return `${"#".repeat(level)} ${Array.from(node.childNodes).map(richInlineMarkdown).join("").trim()}\n\n`;
  }
  if (["p", "div", "pre"].includes(tag)) {
    return Array.from(node.childNodes).map(richBlockMarkdown).join("").trimEnd() + "\n\n";
  }
  return richInlineMarkdown(node) + "\n\n";
}

function richEditorMarkdown() {
  return Array.from(workItemDescriptionContent.childNodes)
    .map(richBlockMarkdown)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function syncRichDescriptionValue() {
  workItemDescription.value = richEditorMarkdown();
}

function setRichDescriptionValue(value) {
  workItemDescription.value = value || "";
  workItemDescriptionContent.innerHTML = value ? markdownBlock(value) : "";
}

function richDescriptionSelection() {
  const selection = window.getSelection();
  if (selection?.rangeCount && workItemDescriptionContent.contains(selection.anchorNode)) {
    richDescriptionSavedRange = selection.getRangeAt(0).cloneRange();
  }
}

function restoreRichDescriptionSelection() {
  workItemDescriptionContent.focus();
  const selection = window.getSelection();
  if (!selection) return null;
  selection.removeAllRanges();
  if (richDescriptionSavedRange && workItemDescriptionContent.contains(richDescriptionSavedRange.commonAncestorContainer)) {
    selection.addRange(richDescriptionSavedRange);
  } else {
    const range = document.createRange();
    range.selectNodeContents(workItemDescriptionContent);
    range.collapse(false);
    selection.addRange(range);
  }
  return selection.getRangeAt(0);
}

function insertRichDescriptionFragment(fragment) {
  const range = restoreRichDescriptionSelection();
  if (!range) return;
  range.deleteContents();
  const lastNode = fragment.lastChild;
  if (lastNode) range.insertNode(fragment);
  if (lastNode?.isConnected) range.setStartAfter(lastNode);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  richDescriptionSavedRange = range.cloneRange();
  workItemDescriptionContent.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
}

function insertRichDescriptionNode(node) {
  const fragment = document.createDocumentFragment();
  fragment.append(node);
  insertRichDescriptionFragment(fragment);
}

function sanitizeRichPasteNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || "");
  if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
  const tag = node.tagName.toLowerCase();
  if (["script", "style", "iframe", "object", "svg", "math", "form", "input", "button", "video", "audio"].includes(tag)) return document.createDocumentFragment();
  const allowed = new Set(["p", "div", "br", "strong", "b", "em", "i", "h3", "h4", "h5", "ul", "ol", "li", "blockquote", "code", "pre", "a", "img"]);
  if (tag === "img") {
    const src = safeRichUrl(node.getAttribute("src"), true);
    if (!src) return document.createDocumentFragment();
    const image = document.createElement("img");
    image.src = src;
    image.alt = (node.getAttribute("alt") || "imagem").slice(0, 300);
    image.loading = "lazy";
    return image;
  }
  if (tag === "a") {
    const href = safeRichUrl(node.getAttribute("href"));
    const anchor = document.createElement("a");
    if (href) {
      anchor.href = href;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    node.childNodes.forEach((child) => anchor.append(sanitizeRichPasteNode(child)));
    return anchor;
  }
  if (!allowed.has(tag)) {
    const fragment = document.createDocumentFragment();
    node.childNodes.forEach((child) => fragment.append(sanitizeRichPasteNode(child)));
    return fragment;
  }
  const clean = document.createElement(tag);
  node.childNodes.forEach((child) => clean.append(sanitizeRichPasteNode(child)));
  return clean;
}

function sanitizeRichPaste(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const fragment = document.createDocumentFragment();
  parsed.body.childNodes.forEach((child) => fragment.append(sanitizeRichPasteNode(child)));
  return fragment;
}

async function uploadRichDescriptionImage(file, range) {
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  try {
    const response = await fetch(`${appBasePath}/api/work-item-images`, { method: "POST", body: formData });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Não foi possível enviar a imagem.");
    if (range && workItemDescriptionContent.contains(range.commonAncestorContainer)) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      richDescriptionSavedRange = range;
    }
    const source = safeRichUrl(body.url, true);
    if (!source) throw new Error("O endereço da imagem não é válido.");
    const image = document.createElement("img");
    image.src = source;
    image.alt = body.name || file.name || "Evidência";
    image.loading = "lazy";
    insertRichDescriptionNode(image);
  } catch (error) {
    window.alert(error.message);
  }
}

function applyRichDescriptionCommand(command) {
  const selection = restoreRichDescriptionSelection();
  if (!selection) return;
  if (command === "bold") document.execCommand("bold");
  if (command === "italic") document.execCommand("italic");
  if (command === "heading") document.execCommand("formatBlock", false, "H3");
  if (command === "unorderedList") document.execCommand("insertUnorderedList");
  if (command === "orderedList") document.execCommand("insertOrderedList");
  if (command === "blockquote") document.execCommand("formatBlock", false, "BLOCKQUOTE");
  if (command === "code") {
    const code = document.createElement("code");
    if (selection.isCollapsed) code.textContent = "código";
    else code.append(selection.extractContents());
    selection.insertNode(code);
    selection.selectNodeContents(code);
    richDescriptionSavedRange = selection.getRangeAt(0).cloneRange();
    workItemDescriptionContent.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "formatText" }));
    return;
  }
  if (command === "link") {
    const url = window.prompt("Endereço do link (https://...)");
    const href = safeRichUrl(url);
    if (!href) return;
    if (!selection.isCollapsed) document.execCommand("createLink", false, href);
    else {
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = url;
      insertRichDescriptionNode(link);
      return;
    }
    workItemDescriptionContent.querySelectorAll("a").forEach((link) => {
      if (safeRichUrl(link.getAttribute("href"))) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
    });
  }
  richDescriptionSelection();
  workItemDescriptionContent.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "formatText" }));
}

function updateRichDescriptionToolbarState() {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !workItemDescriptionContent.contains(selection.anchorNode)) return;
  const activeTags = new Set();
  let element = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
  while (element && workItemDescriptionContent.contains(element)) {
    activeTags.add(element.tagName.toLowerCase());
    element = element.parentElement;
  }
  const active = {
    bold: document.queryCommandState("bold"),
    italic: document.queryCommandState("italic"),
    heading: ["h3", "h4", "h5"].some((tag) => activeTags.has(tag)),
    unorderedList: activeTags.has("ul"),
    orderedList: activeTags.has("ol"),
    blockquote: activeTags.has("blockquote"),
    code: activeTags.has("code"),
    link: activeTags.has("a"),
  };
  workItemDescriptionToolbar.querySelectorAll("[data-command]").forEach((button) => button.setAttribute("aria-pressed", String(Boolean(active[button.dataset.command]))));
}

function insertRichTransferContent(transfer) {
  const image = imageFileFromDataTransfer(transfer);
  if (image) {
    uploadRichDescriptionImage(image, richDescriptionSavedRange?.cloneRange());
    return true;
  }
  const html = transfer?.getData("text/html");
  const text = transfer?.getData("text/plain");
  if (html) {
    insertRichDescriptionFragment(sanitizeRichPaste(html));
    return true;
  }
  if (text) {
    const fragment = document.createDocumentFragment();
    text.split(/\r?\n/).forEach((line) => {
      const paragraph = document.createElement("p");
      if (line) paragraph.textContent = line;
      else paragraph.append(document.createElement("br"));
      fragment.append(paragraph);
    });
    insertRichDescriptionFragment(fragment);
    return true;
  }
  return false;
}

function setRichDescriptionCaretAtPoint(x, y) {
  let range = null;
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  } else if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  }
  if (!range || !workItemDescriptionContent.contains(range.startContainer)) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  richDescriptionSavedRange = range.cloneRange();
}

function setupRichDescriptionEditor() {
  if (!workItemDescriptionContent || workItemDescriptionContent.dataset.ready) return;
  workItemDescriptionContent.dataset.ready = "true";
  document.execCommand("styleWithCSS", false, false);
  document.querySelector("#workItemDescriptionLabel").addEventListener("click", () => workItemDescriptionContent.focus());
  let previousGroup = null;
  richDescriptionTools.forEach(([command, label, title, group]) => {
    if (previousGroup && previousGroup !== group) {
      const separator = document.createElement("span");
      separator.className = "rich-toolbar-separator";
      separator.setAttribute("aria-hidden", "true");
      workItemDescriptionToolbar.append(separator);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.dataset.group = group;
    button.dataset.command = command;
    button.addEventListener("mousedown", (event) => { event.preventDefault(); richDescriptionSelection(); });
    button.addEventListener("click", () => {
      if (command === "image") {
        const range = richDescriptionSavedRange?.cloneRange();
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/png,image/jpeg,image/webp,image/gif";
        input.addEventListener("change", () => uploadRichDescriptionImage(input.files[0], range), { once: true });
        input.click();
        return;
      }
      applyRichDescriptionCommand(command);
    });
    workItemDescriptionToolbar.append(button);
    previousGroup = group;
  });

  workItemDescriptionContent.addEventListener("input", syncRichDescriptionValue);
  workItemDescriptionContent.addEventListener("keyup", richDescriptionSelection);
  workItemDescriptionContent.addEventListener("mouseup", richDescriptionSelection);
  workItemDescriptionContent.addEventListener("paste", (event) => {
    if (!event.clipboardData || (!event.clipboardData.getData("text/html") && !event.clipboardData.getData("text/plain") && !imageFileFromDataTransfer(event.clipboardData))) return;
    event.preventDefault();
    richDescriptionSelection();
    insertRichTransferContent(event.clipboardData);
  });
  workItemDescriptionContent.addEventListener("dragover", (event) => {
    if (imageFileFromDataTransfer(event.dataTransfer)) event.preventDefault();
  });
  workItemDescriptionContent.addEventListener("drop", (event) => {
    const transfer = event.dataTransfer;
    if (!transfer || (!transfer.getData("text/html") && !transfer.getData("text/plain") && !imageFileFromDataTransfer(transfer))) return;
    event.preventDefault();
    setRichDescriptionCaretAtPoint(event.clientX, event.clientY);
    richDescriptionSelection();
    insertRichTransferContent(transfer);
  });
  workItemDescriptionContent.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const command = { b: "bold", i: "italic", k: "link" }[event.key.toLowerCase()];
    if (!command) return;
    event.preventDefault();
    applyRichDescriptionCommand(command);
  });
  document.addEventListener("selectionchange", () => {
    richDescriptionSelection();
    updateRichDescriptionToolbarState();
  });
}

function statusClass(status) {
  if (status === "parsed") return "";
  if (status === "unsupported" || status === "missing") return "warn";
  return "error";
}

function taskStatus(task) {
  if (task.late) return "Atrasada";
  if (task.inProgress) return "Em andamento";
  if (task.attention) return "Atenção";
  if (task.percent >= 100) return "Concluída";
  return "Pendente";
}

function taskMatchesFilter(task, filter) {
  if (filter === "all") return true;
  if (filter === "late") return task.late;
  if (filter === "progress") return task.inProgress;
  if (filter === "attention") return task.attention;
  return true;
}

function hasChild(tasks, index) {
  const currentLevel = Number(tasks[index].outlineLevel || 0);
  const next = tasks[index + 1];
  return Boolean(next && Number(next.outlineLevel || 0) > currentLevel);
}

function isDescendantOf(parent, child) {
  return Number(child.outlineLevel || 0) > Number(parent.outlineLevel || 0);
}

function hasMatchingDescendant(tasks, index, filter) {
  const parent = tasks[index];
  for (let nextIndex = index + 1; nextIndex < tasks.length; nextIndex += 1) {
    const candidate = tasks[nextIndex];
    if (!isDescendantOf(parent, candidate)) break;
    if (taskMatchesFilter(candidate, filter)) return true;
  }
  return false;
}

function taskKey(task, index) {
  return String(task.outlineNumber || task.id || index);
}

function isHiddenByCollapse(tasks, index, collapsed) {
  const task = tasks[index];
  for (let prevIndex = index - 1; prevIndex >= 0; prevIndex -= 1) {
    const candidate = tasks[prevIndex];
    if (!isDescendantOf(candidate, task)) continue;
    if (collapsed.has(taskKey(candidate, prevIndex))) return true;
  }
  return false;
}

function getDashboardNumbers(project) {
  const dashboard = project.dashboard || {};
  const realized = dashboard.realizedPercent ?? dashboard.percentComplete ?? 0;
  const planned = dashboard.plannedPercent ?? plannedPercentFromTasks(dashboard.tasks);
  const variance = dashboard.variancePercent ?? (realized - planned);
  const selectedFile = dashboard.file?.convertedFrom || dashboard.file;

  return { dashboard, realized, planned, variance, selectedFile };
}

function isStudyProject(project) {
  return project.type === "study";
}

function isConstructionProject(project) {
  return project.type === "construction";
}

function projectSource(project) {
  return project.uploadedSchedule?.name || project.sharepointUrl || project.folderPath || "";
}

function editTitleButtonHtml(label) {
  const safeLabel = escapeHtml(label);
  return `
    <button type="button" class="title-edit-button" data-action="edit" title="${safeLabel}" aria-label="${safeLabel}">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
      </svg>
    </button>
  `;
}

function projectRiskClass(dashboard, variance) {
  if ((dashboard.lateTasks ?? 0) > 0) return "late";
  if ((dashboard.attentionTasks ?? 0) > 0 || (projectSettings.negativeVarianceAttention && variance < 0)) return "risk";
  return "ok";
}

function projectRiskLabel(dashboard, variance) {
  if ((dashboard.lateTasks ?? 0) > 0) return "Atrasado";
  if ((dashboard.attentionTasks ?? 0) > 0 || (projectSettings.negativeVarianceAttention && variance < 0)) return "Atenção";
  return "Em dia";
}

function updateCriteriaText() {
  const delay = Number(projectSettings.attentionDelayPercent ?? 10);
  attentionDelayInput.value = delay;
  negativeVarianceInput.checked = Boolean(projectSettings.negativeVarianceAttention);
  criteriaDescription.textContent = `Tarefas não concluídas entram em atenção quando o realizado fica ${delay} p.p. ou mais abaixo do planejado. Atrasos por data continuam como Atrasado${projectSettings.negativeVarianceAttention ? ", e desvio geral negativo também gera atenção no card." : "."}`;
}

function formatPercent(value) {
  return `${value ?? 0}%`;
}

function summarizeTaskLine(task) {
  const outline = task.outlineNumber || task.id || "";
  const prefix = outline ? `${outline} ` : "";
  return `- ${prefix}${task.name}: ${task.percent}% realizado, término ${formatDate(task.finish)}`;
}

function generateStatusReport(project) {
  const { dashboard, realized, planned, variance, selectedFile } = getDashboardNumbers(project);
  const tasks = dashboard.tasks || [];
  const lateTasks = tasks.filter((task) => task.late && !task.summary);
  const attentionTasks = tasks.filter((task) => task.attention && !task.late && !task.summary);
  const inProgressTasks = tasks.filter((task) => task.inProgress && !task.summary);
  const status = projectRiskLabel(dashboard, variance);
  const subject = `Status da evolutiva - ${project.name} - ${status}`;
  const lines = [
    "Olá,",
    "",
    `Segue status atualizado da evolutiva ${project.name}.`,
    "",
    "Resumo executivo:",
    `- Status geral: ${status}`,
    `- Planejado: ${formatPercent(planned)}`,
    `- Realizado: ${formatPercent(realized)}`,
    `- Desvio: ${variance > 0 ? "+" : ""}${variance} p.p.`,
    `- Tarefas em atenção: ${dashboard.attentionTasks ?? 0}`,
    `- Tarefas atrasadas: ${dashboard.lateTasks ?? 0}`,
    `- Tarefas em andamento: ${dashboard.inProgressTasks ?? 0}`,
    "",
    "Cronograma:",
    `- Arquivo utilizado: ${selectedFile?.name || "não identificado"}`,
    `- Última atualização do arquivo: ${selectedFile?.modifiedAt ? formatDate(selectedFile.modifiedAt, true) : "não identificada"}`,
    "",
  ];

  if (lateTasks.length) {
    lines.push("Tarefas atrasadas:", ...lateTasks.slice(0, 8).map(summarizeTaskLine), "");
  }

  if (attentionTasks.length) {
    lines.push("Tarefas que merecem atenção:", ...attentionTasks.slice(0, 8).map(summarizeTaskLine), "");
  }

  if (inProgressTasks.length) {
    lines.push("Tarefas em andamento:", ...inProgressTasks.slice(0, 6).map(summarizeTaskLine), "");
  }

  lines.push(
    "Próximos passos sugeridos:",
    lateTasks.length ? "- Revisar responsáveis e plano de recuperação das tarefas atrasadas." : "- Manter acompanhamento do plano atual.",
    attentionTasks.length ? "- Confirmar se as tarefas em atenção seguem com prazo viável." : "- Sem pontos adicionais de atenção no momento.",
    "",
    "Atenciosamente,",
  );

  return { subject, body: lines.join("\n") };
}

function openStatusReport(project) {
  const report = generateStatusReport(project);
  reportSubject.value = report.subject;
  reportBody.value = report.body;
  reportModal.hidden = false;
}

function openNotes(project) {
  notesProjectId = project.id;
  projectNotes.value = project.notes || "";
  notesModal.hidden = false;
}

function openStudyEditor(project) {
  editingProject = project;
  studyEditProjectId = project.id;
  studyEditName.value = project.name || "";
  studyEditDescription.value = project.description || "";
  resetMarkdownPreview(studyEditDescription);
  studyEditDescriptionField.hidden = !isStudyProject(project);
  studyEditModal.hidden = false;
  studyEditName.focus();
}

function renderTaskFilters(container, state, onChange) {
  container.innerHTML = "";
  const filters = [
    ["all", "Todas"],
    ["attention", "Atenção"],
    ["late", "Atrasadas"],
    ["progress", "Em andamento"],
  ];

  for (const [value, label] of filters) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = value === state.filter ? "active" : "";
    button.textContent = label;
    button.addEventListener("click", () => {
      state.filter = value;
      onChange();
    });
    container.appendChild(button);
  }
}

function renderTasks(container, tasks = [], state = { filter: "all", collapsed: new Set() }) {
  container.innerHTML = "";
  if (!tasks.length) {
    container.innerHTML = "<p class=\"hint\">Nenhuma tarefa identificada.</p>";
    return;
  }

  const table = document.createElement("table");
  table.className = "task-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Tarefa</th>
        <th>Início</th>
        <th>Término</th>
        <th>Planejado</th>
        <th>Realizado</th>
        <th>Atraso</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  tasks.forEach((task, index) => {
    if (isHiddenByCollapse(tasks, index, state.collapsed)) return;

    const matches = taskMatchesFilter(task, state.filter);
    const context = !matches && state.filter !== "all" && hasMatchingDescendant(tasks, index, state.filter);
    if (!matches && !context) return;

    const level = Math.max(1, Number(task.outlineLevel || 1));
    const outline = task.outlineNumber || task.id || "";
    const title = `${outline ? `${outline} ` : ""}${task.name}`;
    const row = document.createElement("tr");
    const key = taskKey(task, index);
    const child = hasChild(tasks, index);
    const collapsed = state.collapsed.has(key);
    const status = taskStatus(task);

    row.className = `task-row${task.late ? " late" : ""}${task.attention ? " attention" : ""}${task.summary ? " summary" : ""}${context ? " context" : ""}`;
    row.style.setProperty("--task-indent", `${Math.min(level - 1, 6) * 18}px`);
    row.innerHTML = `
      <td class="task-name">
        <button type="button" class="tree-toggle" title="${child ? "Expandir ou recolher" : ""}" ${child ? "" : "disabled"}>${child ? (collapsed ? "+" : "-") : ""}</button>
        <strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong>
      </td>
      <td>${formatDate(task.start)}</td>
      <td>${formatDate(task.finish)}</td>
      <td>${task.plannedPercent ?? "-"}%</td>
      <td><b>${task.percent}%</b></td>
      <td>${task.delayPercent ?? 0} p.p.</td>
      <td><em class="status-pill ${task.late ? "danger" : task.attention ? "attention" : task.inProgress ? "progress" : task.percent >= 100 ? "done" : ""}">${status}</em></td>
    `;

    row.querySelector(".tree-toggle").addEventListener("click", () => {
      if (collapsed) state.collapsed.delete(key);
      else state.collapsed.add(key);
      renderTasks(container, tasks, state);
    });
    tbody.appendChild(row);
  });

  container.appendChild(table);
}

function renderDashboard(projects) {
  document.body.classList.remove("kanban-workspace");
  dashboardTitle.textContent = "Dashboard";
  projectsEl.className = "dashboard-sections";
  projectsEl.innerHTML = "";

  const ordered = orderedDashboardProjects(projects);
  const allItems = [...ordered.projects, ...ordered.studies];
  const visibleProjects = ordered.projects.filter(matchesDashboardProjectFilter);
  const visibleStudies = ordered.studies.filter(matchesDashboardProjectFilter);
  projectsEl.appendChild(renderDashboardProjectFilters(allItems));
  const sections = [renderWorkPlanSection(), renderDashboardSection("Evolutivas", visibleProjects, "projects", ordered.projects), renderDashboardSection("Estudos", visibleStudies, "studies", ordered.studies)].filter(Boolean);
  for (const section of orderedDashboardSections(sections)) {
    projectsEl.appendChild(section);
  }
  enableDashboardSectionSorting();
  schedulePercentageAlignment();
  if (!projects.length) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Nenhuma evolutiva cadastrada.";
    projectsEl.appendChild(hint);
    return;
  }
}

function matchesDashboardProjectFilter(project) {
  return dashboardProjectFilter === "all" || Boolean(project.completed) === (dashboardProjectFilter === "completed");
}

function renderDashboardProjectFilters(items) {
  const toolbar = document.createElement("div");
  toolbar.className = "dashboard-filter-toolbar";
  toolbar.innerHTML = `
    <div class="dashboard-filter-copy"><strong>Situação dos projetos</strong><span>Filtro aplicado a evolutivas e estudos</span></div>
    <div class="dashboard-project-filters" role="group" aria-label="Filtrar projetos por situação">
      ${[["all", "Todos"], ["active", "Em andamento"], ["completed", "Concluídos"]].map(([value, label]) => `<button type="button" data-project-filter="${value}" aria-pressed="${dashboardProjectFilter === value}">${label}<span>${items.filter((project) => value === "all" || Boolean(project.completed) === (value === "completed")).length}</span></button>`).join("")}
    </div>
  `;
  toolbar.querySelectorAll("[data-project-filter]").forEach((button) => button.addEventListener("click", () => {
    dashboardProjectFilter = button.dataset.projectFilter;
    renderDashboard(projectsCache);
  }));
  return toolbar;
}

function alignDashboardPercentages() {
  const cards = [...projectsEl.querySelectorAll(".summary-card")]
    .filter((card) => card.querySelector(".summary-kpis"));
  const rows = new Map();

  cards.forEach((card) => {
    const head = card.querySelector(".summary-head");
    if (head) head.style.minHeight = "";
  });

  cards.forEach((card) => {
    const head = card.querySelector(".summary-head");
    if (!head) return;
    const row = Math.round(card.getBoundingClientRect().top);
    const current = rows.get(row) || [];
    current.push(head);
    rows.set(row, current);
  });

  rows.forEach((heads) => {
    const height = Math.max(...heads.map((head) => head.getBoundingClientRect().height));
    heads.forEach((head) => {
      head.style.minHeight = `${height}px`;
    });
  });
}

function schedulePercentageAlignment() {
  if (percentageAlignmentFrame !== null) cancelAnimationFrame(percentageAlignmentFrame);
  percentageAlignmentFrame = requestAnimationFrame(() => {
    percentageAlignmentFrame = null;
    alignDashboardPercentages();
  });
}

function renderWorkPlanSection() {
  const image = projectSettings.workPlanImage || null;
  const collapsed = isDashboardSectionCollapsed("work-plan");
  const section = document.createElement("section");
  section.className = "dashboard-section work-plan-section";
  section.dataset.dashboardGroup = "work-plan";
  section.draggable = true;
  section.classList.toggle("is-collapsed", collapsed);
  section.innerHTML = `
    <div class="dashboard-section-head">
      <div>
        <h3>Plano de trabalho</h3>
        <span>${image ? escapeHtml(image.name || "Imagem enviada") : "Planejamento compartilhado da equipe"}</span>
      </div>
      <button class="section-toggle" type="button" aria-expanded="${collapsed ? "false" : "true"}">${collapsed ? "Expandir" : "Recolher"}</button>
    </div>
    <div class="work-plan-body" ${collapsed ? "hidden" : ""}></div>
  `;

  const body = section.querySelector(".work-plan-body");
  const imageVersion = image?.id ? `?v=${encodeURIComponent(image.id)}` : "";
  const imageUrl = `${appBasePath}/api/project-plan-image${imageVersion}`;
  if (image) {
    body.innerHTML = `
      <a class="work-plan-preview" href="${escapeHtml(imageUrl)}" target="_blank" rel="noreferrer">
        <img src="${escapeHtml(imageUrl)}" alt="Plano de trabalho" />
      </a>
    `;
  } else {
    body.innerHTML = `
      <div class="work-plan-empty">
        <p>Nenhuma imagem de plano de trabalho enviada.</p>
        <button type="button" data-action="open-settings">Adicionar plano de trabalho</button>
      </div>
    `;
    body.querySelector("[data-action='open-settings']").addEventListener("click", () => {
      settingsModal.hidden = false;
    });
  }
  section.querySelector(".section-toggle").addEventListener("click", () => toggleDashboardSection(section, "work-plan"));
  return section;
}

function renderDashboardSection(title, items, group, allItems = items) {
  if (!allItems.length) return null;

  const collapsed = isDashboardSectionCollapsed(group);
  const section = document.createElement("section");
  section.className = "dashboard-section";
  section.dataset.dashboardGroup = group;
  section.draggable = true;
  section.classList.toggle("is-collapsed", collapsed);
  section.innerHTML = `
    <div class="dashboard-section-head">
      <div>
        <h3>${title}</h3>
        <span>${items.length} ${items.length === 1 ? "item" : "itens"} - ordem manual</span>
      </div>
      <button class="section-toggle" type="button" aria-expanded="${collapsed ? "false" : "true"}">${collapsed ? "Expandir" : "Recolher"}</button>
    </div>
    <div class="dashboard-grid sortable-grid" data-order-group="${group}" ${collapsed ? "hidden" : ""}></div>
  `;
  const grid = section.querySelector(".dashboard-grid");

  for (const project of items) {
    grid.appendChild(isStudyProject(project) ? createStudyCard(project) : isConstructionProject(project) ? createConstructionCard(project) : createProjectCard(project));
  }

  if (dashboardProjectFilter === "all") enableDashboardSorting(grid);
  else grid.querySelectorAll(".summary-card").forEach((card) => { card.draggable = false; card.title = ""; });
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "evolution-empty";
    const noun = group === "studies" ? "estudo" : "evolutiva";
    empty.textContent = dashboardProjectFilter === "completed" ? `Nenhum ${noun} concluído.` : `Nenhum ${noun} em andamento.`;
    grid.appendChild(empty);
  }
  section.querySelector(".section-toggle").addEventListener("click", () => toggleDashboardSection(section, group));
  return section;
}

function toggleDashboardSection(section, group) {
  const collapsed = !section.classList.contains("is-collapsed");
  section.classList.toggle("is-collapsed", collapsed);
  const content = section.querySelector(".dashboard-grid, .work-plan-body");
  if (content) content.hidden = collapsed;
  const button = section.querySelector(".section-toggle");
  if (button) {
    button.textContent = collapsed ? "Expandir" : "Recolher";
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
  saveDashboardSectionState(group, collapsed);
}

function readDashboardSectionState() {
  try {
    return JSON.parse(localStorage.getItem(dashboardCollapsedKey) || "{}");
  } catch {
    return {};
  }
}

function isDashboardSectionCollapsed(group) {
  return readDashboardSectionState()[group] === true;
}

function saveDashboardSectionState(group, collapsed) {
  const state = readDashboardSectionState();
  state[group] = collapsed;
  localStorage.setItem(dashboardCollapsedKey, JSON.stringify(state));
}

function orderedDashboardSections(sections) {
  const savedOrder = readDashboardGroupOrder();
  const fallback = new Map(defaultDashboardGroupOrder.map((group, index) => [group, index + 100]));
  const position = new Map(savedOrder.map((group, index) => [group, index]));
  return [...sections].sort((a, b) => {
    const left = a.dataset.dashboardGroup;
    const right = b.dataset.dashboardGroup;
    const leftPosition = position.has(left) ? position.get(left) : fallback.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = position.has(right) ? position.get(right) : fallback.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition;
  });
}

function readDashboardGroupOrder() {
  try {
    const parsed = JSON.parse(localStorage.getItem(dashboardGroupOrderKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDashboardGroupOrder() {
  const groups = [...projectsEl.querySelectorAll(".dashboard-section")]
    .map((section) => section.dataset.dashboardGroup)
    .filter(Boolean);
  localStorage.setItem(dashboardGroupOrderKey, JSON.stringify(groups));
}

function enableDashboardSectionSorting() {
  if (projectsEl.dataset.sectionSorting === "ready") return;
  projectsEl.dataset.sectionSorting = "ready";
  projectsEl.addEventListener("dragstart", onDashboardSectionDragStart);
  projectsEl.addEventListener("dragover", onDashboardSectionDragOver);
  projectsEl.addEventListener("dragend", onDashboardSectionDragEnd);
}

function onDashboardSectionDragStart(event) {
  if (event.target.closest(".summary-card")) return;
  const section = event.target.closest(".dashboard-section");
  if (!section || section.parentElement !== projectsEl) return;
  draggedDashboardSection = section;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", section.dataset.dashboardGroup || "");
  requestAnimationFrame(() => section.classList.add("dragging-section"));
}

function onDashboardSectionDragOver(event) {
  if (!draggedDashboardSection) return;
  event.preventDefault();
  const target = dragTargetSection(event.clientY);
  if (target) projectsEl.insertBefore(draggedDashboardSection, target);
  else projectsEl.appendChild(draggedDashboardSection);
}

function onDashboardSectionDragEnd() {
  if (!draggedDashboardSection) return;
  draggedDashboardSection.classList.remove("dragging-section");
  saveDashboardGroupOrder();
  draggedDashboardSection = null;
}

function dragTargetSection(y) {
  const sections = [...projectsEl.querySelectorAll(".dashboard-section:not(.dragging-section)")];
  return sections.find((section) => {
    const box = section.getBoundingClientRect();
    return y < box.top + box.height / 2;
  }) || null;
}

function createStudyCard(project) {
  const card = createDashboardCard(project, "study");
  card.innerHTML = `
    <div class="summary-head">
      <div class="summary-title-block">
        <div class="title-row">
          <h3>${escapeHtml(project.name)}</h3>
          ${editTitleButtonHtml("Editar estudo")}
        </div>
        <p>${project.completed ? "Estudo finalizado" : "Evolutiva em estudo"}</p>
      </div>
      <div class="summary-status-stack"><span class="summary-status ${project.completed ? "completed" : "study"}">${project.completed ? "Concluído" : "Em estudo"}</span>${projectCompletionButton(project)}</div>
    </div>
    <div class="note-preview markdown-content">${markdownBlock(project.description, "Evolutiva em estudo aguardando definição de escopo, cronograma ou priorização.")}</div>
    <div class="summary-actions study-actions">
      <button type="button" data-action="delete">Excluir</button>
    </div>
  `;
  card.querySelector("[data-action='edit']").addEventListener("click", () => openStudyEditor(project));
  card.querySelector("[data-action='delete']").addEventListener("click", () => deleteProject(project.id));
  bindProjectCompletion(card, project);
  return card;
}

function createConstructionCard(project) {
  const card = createDashboardCard(project, "construction");
  card.innerHTML = `
    <div class="summary-head">
      <div class="summary-title-block">
        <div class="title-row">
          <h3>${escapeHtml(project.name)}</h3>
          ${editTitleButtonHtml("Editar título")}
        </div>
        <p>Evolutiva sem cronograma</p>
      </div>
      <div class="summary-status-stack"><span class="summary-status ${project.completed ? "completed" : "construction"}">${project.completed ? "Concluída" : "Em construção"}</span>${projectCompletionButton(project)}</div>
    </div>
    <div class="note-preview markdown-content">${markdownBlock(project.notes, "Evolutiva em construção aguardando cronograma ou definição complementar.")}</div>
    <div class="summary-actions construction-actions">
      <button type="button" data-action="open">Abrir evolutiva</button>
      <button type="button" data-action="update">Atualizar cronograma</button>
      <button type="button" data-action="notes">Informações</button>
      <button type="button" data-action="delete">Excluir</button>
    </div>
  `;
  card.querySelector("[data-action='open']").addEventListener("click", () => openProject(project.id));
  card.querySelector("[data-action='edit']").addEventListener("click", () => openStudyEditor(project));
  card.querySelector("[data-action='update']").addEventListener("click", () => chooseScheduleUpdate(project.id));
  card.querySelector("[data-action='notes']").addEventListener("click", () => openNotes(project));
  card.querySelector("[data-action='delete']").addEventListener("click", () => deleteProject(project.id));
  bindProjectCompletion(card, project);
  return card;
}

function createProjectCard(project) {
  const { dashboard, realized, planned, variance, selectedFile } = getDashboardNumbers(project);
  const riskClass = projectRiskClass(dashboard, variance);
  const notes = String(project.notes || "").trim();
  const openBugs = (project.workItems || []).filter((item) => item.type === "bug" && item.status !== "closed").length;
  const card = createDashboardCard(project, riskClass);
  card.innerHTML = `
    <div class="summary-head">
      <div class="summary-title-block">
        <div class="title-row">
          <h3>${escapeHtml(project.name)}</h3>
          ${editTitleButtonHtml("Editar título")}
        </div>
        <p>${escapeHtml(selectedFile?.name || "Nenhum cronograma localizado")}</p>
      </div>
      <div class="summary-status-stack"><span class="summary-status ${project.completed ? "completed" : riskClass}">${project.completed ? "Concluída" : dashboard.status === "parsed" ? projectRiskLabel(dashboard, variance) : "Falha"}</span>${projectCompletionButton(project)}</div>
    </div>
    <div class="summary-kpis">
      <div><span>Planejado</span><strong>${planned}%</strong></div>
      <div><span>Realizado</span><strong>${realized}%</strong></div>
      <div><span>Desvio</span><strong>${variance > 0 ? "+" : ""}${variance} p.p.</strong></div>
    </div>
    ${(project.workItems || []).length ? `<div class="activity-glance"><span>${project.workItems.length} atividades</span><strong class="${openBugs ? "has-open-bugs" : ""}">${openBugs} bugs abertos</strong></div>` : ""}
    ${notes ? `<div class="note-preview markdown-content">${markdownBlock(notes)}</div>` : ""}
    <div class="summary-progress">
      <span style="width:${Math.max(0, Math.min(100, realized))}%"></span>
    </div>
    <div class="summary-actions">
      <button type="button" data-action="open">Abrir evolutiva</button>
      <button type="button" data-action="update">Atualizar cronograma</button>
      <button type="button" data-action="notes">Informações</button>
    </div>
  `;
  card.querySelector("[data-action='open']").addEventListener("click", () => openProject(project.id));
  card.querySelector("[data-action='edit']").addEventListener("click", () => openStudyEditor(project));
  card.querySelector("[data-action='update']").addEventListener("click", () => chooseScheduleUpdate(project.id));
  card.querySelector("[data-action='notes']").addEventListener("click", () => openNotes(project));
  bindProjectCompletion(card, project);
  return card;
}

function projectCompletionButton(project) {
  const subject = isStudyProject(project) ? "estudo" : "projeto";
  const action = project.completed ? `Reabrir ${subject}` : `Concluir ${subject}`;
  return `<button class="project-completion-toggle" type="button" data-action="toggle-completion" aria-label="${action}">${action}</button>`;
}

function bindProjectCompletion(card, project) {
  card.querySelector("[data-action='toggle-completion']")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await fetch(`${appBasePath}/api/projects/${project.id}/completion`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !project.completed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar a evolutiva.");
      await loadProjects();
    } catch (error) {
      window.alert(error.message);
      button.disabled = false;
    }
  });
}

function createDashboardCard(project, className) {
  const card = document.createElement("article");
  card.className = `summary-card ${className}`;
  card.draggable = true;
  card.dataset.id = project.id;
  card.dataset.orderGroup = isStudyProject(project) ? "studies" : "projects";
  card.title = "Arraste para organizar";
  return card;
}

function orderedDashboardProjects(projects) {
  const order = readDashboardOrder();
  return {
    projects: orderBySavedPosition(projects.filter((project) => !isStudyProject(project)), order.projects),
    studies: orderBySavedPosition(projects.filter(isStudyProject), order.studies),
  };
}

function orderBySavedPosition(items, savedIds = []) {
  const position = new Map(savedIds.map((id, index) => [String(id), index]));
  return [...items].sort((a, b) => {
    const left = position.has(String(a.id)) ? position.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
    const right = position.has(String(b.id)) ? position.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

function readDashboardOrder() {
  try {
    const parsed = JSON.parse(localStorage.getItem(dashboardOrderKey) || "{}");
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      studies: Array.isArray(parsed.studies) ? parsed.studies : [],
    };
  } catch {
    return { projects: [], studies: [] };
  }
}

function saveDashboardOrder(group, grid) {
  const order = readDashboardOrder();
  order[group] = [...grid.querySelectorAll(".summary-card")].map((card) => card.dataset.id);
  localStorage.setItem(dashboardOrderKey, JSON.stringify(order));
}

function enableDashboardSorting(grid) {
  grid.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".summary-card");
    if (!card) return;
    draggedDashboardCard = card;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.id || "");
    requestAnimationFrame(() => card.classList.add("dragging"));
  });

  grid.addEventListener("dragover", (event) => {
    if (!draggedDashboardCard || draggedDashboardCard.dataset.orderGroup !== grid.dataset.orderGroup) return;
    event.preventDefault();
    const target = dragTargetCard(grid, event.clientX, event.clientY);
    if (target) grid.insertBefore(draggedDashboardCard, target);
    else grid.appendChild(draggedDashboardCard);
  });

  grid.addEventListener("dragend", () => {
    if (!draggedDashboardCard) return;
    draggedDashboardCard.classList.remove("dragging");
    saveDashboardOrder(grid.dataset.orderGroup, grid);
    draggedDashboardCard = null;
  });
}

function dragTargetCard(grid, x, y) {
  const cards = [...grid.querySelectorAll(".summary-card:not(.dragging)")];
  return cards.find((card) => {
    const box = card.getBoundingClientRect();
    const beforeRow = y < box.top + box.height / 2;
    const sameRow = y >= box.top && y <= box.bottom;
    const beforeColumn = x < box.left + box.width / 2;
    return beforeRow || (sameRow && beforeColumn);
  }) || null;
}

function renderProjectDetail(project) {
  dashboardTitle.textContent = project.name;
  projectsEl.className = "project-grid";
  projectsEl.innerHTML = "";

  const node = detailTemplate.content.cloneNode(true);
  const { dashboard, realized, planned, variance, selectedFile } = getDashboardNumbers(project);

  if (!projectUiState.has(project.id)) {
    projectUiState.set(project.id, { filter: "all", collapsed: new Set(), workItemView: getStoredWorkItemView() });
  }
  const taskState = projectUiState.get(project.id);

  setText(node, "name", project.name);
  setText(node, "folder", projectSource(project));
  setText(node, "message", dashboard.message || "Aguardando leitura do cronograma.");
  setText(node, "plannedPercent", `${planned}%`);
  setText(node, "realizedPercent", `${realized}%`);
  setText(node, "variancePercent", `${variance > 0 ? "+" : ""}${variance} p.p.`);
  setText(node, "plannedLabel", `${planned}%`);
  setText(node, "realizedLabel", `${realized}%`);
  setText(node, "totalTasks", dashboard.totalTasks ?? "-");
  setText(node, "completedTasks", dashboard.completedTasks ?? "-");
  setText(node, "inProgressTasks", dashboard.inProgressTasks ?? "-");
  setText(node, "lateTasks", dashboard.lateTasks ?? "-");
  setText(node, "attentionTasks", dashboard.attentionTasks ?? "-");
  setText(node, "fileName", selectedFile?.name ? `Arquivo selecionado: ${selectedFile.name}` : "Nenhum cronograma localizado");
  setText(node, "fileDate", selectedFile?.modifiedAt ? `Atualizado em ${formatDate(selectedFile.modifiedAt, true)}` : "");

  const varianceCard = node.querySelector("[data-field='varianceCard']");
  varianceCard.classList.toggle("bad", variance < 0);
  varianceCard.classList.toggle("good", variance >= 0);
  node.querySelector("[data-field='plannedProgress']").style.width = `${planned}%`;
  node.querySelector("[data-field='progress']").style.width = `${realized}%`;
  node.querySelector("[data-field='message']").className = `status-line ${statusClass(dashboard.status)}`;
  node.querySelector("[data-action='back']").addEventListener("click", showDashboard);
  node.querySelector("[data-action='delete']").addEventListener("click", () => deleteProject(project.id));
  node.querySelector("[data-action='edit']").addEventListener("click", () => openStudyEditor(project));
  node.querySelector("[data-action='report']").addEventListener("click", () => openStatusReport(project));
  node.querySelector("[data-action='update']").addEventListener("click", () => chooseScheduleUpdate(project.id));
  node.querySelector("[data-action='notes']").addEventListener("click", () => openNotes(project));
  node.querySelector("[data-action='add-work-item']").addEventListener("click", () => openWorkItemEditor(project));
  configureCollapsiblePanel(node, taskState, "schedule", "[data-field='scheduleBody']", "[data-action='toggle-schedule']");
  configureCollapsiblePanel(node, taskState, "work-items", "[data-field='workItemsBody']", "[data-action='toggle-work-items']");

  renderWorkItems(node, project);

  const taskContainer = node.querySelector("[data-field='tasks']");
  const filtersContainer = node.querySelector("[data-field='taskFilters']");
  const repaintTasks = () => {
    renderTaskFilters(filtersContainer, taskState, repaintTasks);
    renderTasks(taskContainer, dashboard.tasks, taskState);
  };
  repaintTasks();

  projectsEl.appendChild(node);
  requestAnimationFrame(syncKanbanViewport);
}

function isProjectManagerAgentSupported(project) {
  const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
  return normalize(project?.name) === normalize("Reforma Tributária - escopo Novas taxas e Novas adequações fiscais");
}

function isProjectManagerAdmin() {
  return authState.user?.role === "admin" && !authState.user.mustChangePassword;
}

function openProjectManagerAssistant(project) {
  if (!isProjectManagerAgentSupported(project) || !isProjectManagerAdmin() || projectUiState.get(project.id)?.workItemView !== "kanban") return;
  managerAssistantProjectId = project.id;
  managerAssistantPanel.querySelector("[data-field='managerAssistantProject']").textContent = project.name;
  managerAssistantPanel.hidden = false;
  managerAssistantPanel.querySelector("[data-field='managerAssistantNotice']").textContent = "Verificando a configuração da análise do projeto…";
  managerAssistantStatusPromise = fetch(`${appBasePath}/api/projects/${project.id}/project-manager/status`)
    .then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não consegui consultar a configuração da análise.");
      setManagerAssistantMode(body.provider, body.model);
      return body;
    })
    .catch((error) => {
      setManagerAssistantMode("interno", "", error.message);
      return { provider: "interno", model: "" };
    });
  if (!managerAssistantMessages.childElementCount) {
    appendManagerAssistantMessage("assistant", "Posso preparar o status do projeto, apontar riscos e atrasos, identificar responsáveis e próximas ações, montar uma pauta e redigir cobranças para revisão.");
  }
  managerAssistantInput.focus();
}

function setManagerAssistantMode(provider, model = "", warning = "") {
  const notice = managerAssistantPanel.querySelector("[data-field='managerAssistantNotice']");
  const footnote = managerAssistantPanel.querySelector("[data-field='managerAssistantFootnote']");
  if (provider === "openai") {
    notice.textContent = `OpenAI ativo (${model || "modelo configurado"}). A pergunta, o histórico recente e os campos do projeto serão enviados à API OpenAI para gerar a resposta.`;
    footnote.textContent = "As respostas desta integração usam store:false. A retenção padrão de logs de segurança da OpenAI pode chegar a 30 dias.";
  } else if (provider === "openai-fallback") {
    notice.textContent = warning || "A consulta foi enviada à OpenAI, mas não recebi uma resposta. O conteúdo foi analisado internamente como alternativa.";
    footnote.textContent = `Modelo configurado: ${model || "OpenAI"}. Revise as respostas antes de compartilhar.`;
  } else {
    notice.textContent = warning || "Modo interno ativo. Perguntas e contexto não são enviados à OpenAI; as respostas usam regras e dados cadastrados no painel.";
    footnote.textContent = "Cobranças permanecem como rascunhos até você revisar e enviar na conversa da atividade.";
  }
}

function appendManagerAssistantMessage(role, text, suggestions = [], state = "") {
  const message = document.createElement("article");
  message.className = `manager-assistant-message ${role}${state ? ` ${state}` : ""}`;
  const content = document.createElement("div");
  content.className = "manager-assistant-message-content";
  if (state === "error") {
    content.textContent = text;
  } else {
    content.innerHTML = markdownBlock(text);
  }
  message.append(content);
  if (suggestions.length) {
    const actions = document.createElement("div");
    actions.className = "manager-assistant-suggestions";
    suggestions.forEach((suggestion) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "manager-assistant-suggestion";
      button.dataset.managerWorkItem = suggestion.workItemId;
      const title = document.createElement("span");
      title.textContent = suggestion.label || "Preparar cobrança";
      const context = document.createElement("small");
      context.textContent = suggestion.workItemTitle;
      button.append(title, context);
      button.addEventListener("click", () => openManagerReminder(suggestion));
      actions.append(button);
    });
    message.append(actions);
  }
  managerAssistantMessages.append(message);
  managerAssistantMessages.scrollTop = managerAssistantMessages.scrollHeight;
  return message;
}

async function askProjectManager(question) {
  if (!managerAssistantProjectId || managerAssistantBusy) return;
  const prompt = String(question || "").trim();
  if (!prompt) return;
  const history = managerAssistantHistory.slice(-10).map((entry) => ({
    role: entry.role,
    content: String(entry.content || "").slice(0, entry.role === "assistant" ? 3500 : 1000),
  }));
  while (history.length && history.reduce((total, entry) => total + entry.content.length, 0) > 8000) history.shift();
  managerAssistantHistory.push({ role: "user", content: prompt });
  appendManagerAssistantMessage("user", prompt);
  managerAssistantInput.value = "";
  managerAssistantBusy = true;
  managerAssistantSend.disabled = true;
  managerAssistantSend.textContent = "Analisando…";
  managerAssistantPanel.setAttribute("aria-busy", "true");
  const pending = appendManagerAssistantMessage("assistant", "Lendo as atividades do projeto…", [], "pending");
  try {
    await managerAssistantStatusPromise;
    const response = await fetch(`${appBasePath}/api/projects/${managerAssistantProjectId}/project-manager`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: prompt, history }),
    });
    const body = await response.json().catch(() => ({}));
    pending.remove();
    if (!response.ok) throw new Error(body.error || "Não foi possível analisar o projeto.");
    setManagerAssistantMode(body.provider, body.model, body.warning);
    appendManagerAssistantMessage("assistant", body.answer, body.suggestions || []);
    managerAssistantHistory.push({ role: "assistant", content: body.answer });
  } catch (error) {
    pending.remove();
    appendManagerAssistantMessage("assistant", error.message || "Não foi possível analisar o projeto.", [], "error");
    managerAssistantHistory.push({ role: "assistant", content: error.message || "Não foi possível analisar o projeto." });
  } finally {
    managerAssistantBusy = false;
    managerAssistantSend.disabled = false;
    managerAssistantSend.textContent = "Perguntar";
    managerAssistantPanel.removeAttribute("aria-busy");
  }
}

function openManagerReminder(suggestion) {
  const project = projectsCache.find((item) => item.id === managerAssistantProjectId);
  const item = (project?.workItems || []).find((candidate) => candidate.id === suggestion.workItemId);
  if (!project || !item) return;
  openWorkItemEditor(project, item);
  document.querySelector('[data-editor-tab="conversation"]')?.click();
  const comment = document.querySelector("#commentText");
  if (window.prefillProjectManagerMention) {
    window.prefillProjectManagerMention(suggestion.assigneeId, suggestion.text);
  } else {
    comment.value = suggestion.text.replace("{{responsavel}}", suggestion.assignee || "responsável");
  }
  comment.focus();
}

function configureCollapsiblePanel(root, state, key, bodySelector, buttonSelector) {
  const body = root.querySelector(bodySelector);
  const button = root.querySelector(buttonSelector);
  const collapsed = state.collapsed.has(key);
  body.hidden = collapsed;
  button.textContent = collapsed ? "Expandir" : "Recolher";
  button.setAttribute("aria-expanded", String(!collapsed));
  button.addEventListener("click", () => {
    if (state.collapsed.has(key)) state.collapsed.delete(key);
    else state.collapsed.add(key);
    const isCollapsed = state.collapsed.has(key);
    body.hidden = isCollapsed;
    button.textContent = isCollapsed ? "Expandir" : "Recolher";
    button.setAttribute("aria-expanded", String(!isCollapsed));
  });
}

function renderWorkItems(root, project) {
  const allItems = project.workItems || [];
  const activeItems = allItems.filter((item) => !item.archived);
  const archivedItems = allItems.filter((item) => item.archived);
  const state = projectUiState.get(project.id);
  state.workItemFilter ||= "all";
  state.workItemView ||= getStoredWorkItemView();
  const requirements = activeItems.filter((item) => item.type === "requirement");
  const definitions = activeItems.filter((item) => item.type === "technical-definition");
  const bugs = activeItems.filter((item) => item.type === "bug");
  const openBugs = bugs.filter((item) => item.status !== "closed");
  const summary = root.querySelector("[data-field='workItemSummary']");
  summary.innerHTML = `
    <div><strong>${requirements.length}</strong><span>Requisitos</span></div>
    <div><strong>${definitions.length}</strong><span>Definições técnicas</span></div>
    <div class="${openBugs.length ? "attention" : ""}"><strong>${openBugs.length}</strong><span>Bugs abertos</span></div>
  `;
  const attentionOptions = [["overdue", "Atrasadas"], ["blocked", "Bloqueadas"], ["unassigned", "Sem responsável"], ["soon", "Vencem em 7 dias"], ["mine", "Minhas atividades"], ["mentions", "Minhas menções"]];
  summary.innerHTML += attentionOptions.map(([filter, label]) => `<button type="button" class="attention-metric ${state.attentionFilter === filter ? "active" : ""}" data-attention="${filter}"><strong>${activeItems.filter((item) => workItemMatchesAttention(item, filter)).length}</strong><span>${label}</span></button>`).join("");
  summary.querySelectorAll("[data-attention]").forEach((button) => button.addEventListener("click", () => {
    if (["mine", "mentions"].includes(button.dataset.attention) && !managementIdentity()) { alert("Este filtro estará disponível quando houver identificação dos usuários."); return; }
    state.attentionFilter = state.attentionFilter === button.dataset.attention ? null : button.dataset.attention;
    state.workItemFilter = "all";
    renderProjectDetail(project);
  }));
  if (state.attentionFilter) summary.insertAdjacentHTML("beforeend", '<button type="button" data-clear-attention>Limpar filtro de atenção</button>');
  summary.querySelector("[data-clear-attention]")?.addEventListener("click", () => { state.attentionFilter = null; renderProjectDetail(project); });

  const viewSwitch = root.querySelector("[data-field='workItemViewSwitch']");
  const viewOptions = [["list", "Lista"], ["status", "Por etapa"]];
  if (state.workItemFilter === "bug") viewOptions.push(["grouped", "Por definição"]);
  if (state.workItemFilter !== "archived") viewOptions.push(["kanban", "Kanban"]);
  if (!viewOptions.some(([value]) => value === state.workItemView)) state.workItemView = "list";
  const isKanban = state.workItemView === "kanban";
  document.body.classList.toggle("kanban-workspace", isKanban);
  root.querySelector('.work-items-panel').closest('article').classList.toggle('kanban-project', isKanban);
  const managerAssistantButton = root.querySelector("[data-action='project-manager']");
  managerAssistantButton.hidden = !(isKanban && isProjectManagerAdmin() && isProjectManagerAgentSupported(project));
  managerAssistantButton.onclick = () => openProjectManagerAssistant(project);
  if (!isKanban || !isProjectManagerAdmin()) managerAssistantPanel.hidden = true;
  if (isKanban) {
    root.querySelector("[data-field='workItemsBody']").hidden = false;
    const actions = root.querySelector('[data-action=report]')?.parentElement;
    if (actions) {
      actions.classList.add('kanban-project-actions');
      const back = actions.querySelector('[data-action=back]');
      const menu = document.createElement('details');
      menu.className = 'kanban-project-menu';
      menu.innerHTML = '<summary>Opções do projeto</summary><div></div>';
      [...actions.children].filter(button => button !== back).forEach(button => menu.lastElementChild.appendChild(button));
      actions.replaceChildren(...(back ? [back,menu] : [menu]));
    }
  }
  viewSwitch.innerHTML = viewOptions.map(([value, label]) => `<button type="button" class="${state.workItemView === value ? "active" : ""}" data-view="${value}">${label}</button>`).join("");
  viewSwitch.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    state.workItemView = button.dataset.view;
    setStoredWorkItemView(state.workItemView);
    renderProjectDetail(project);
  }));
  const filters = root.querySelector("[data-field='workItemFilters']");
  const filterOptions = [["all", "Todas"], ["requirement", "Requisitos"], ["technical-definition", "Definições"], ["bug", "Bugs"], ["archived", `Arquivadas (${archivedItems.length})`]];
  filters.innerHTML = filterOptions.map(([value, label]) => `<button type="button" class="${state.workItemFilter === value ? "active" : ""}" data-filter="${value}">${label}</button>`).join("");
  filters.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    state.workItemFilter = button.dataset.filter;
    renderProjectDetail(project);
  }));

  window.decorateWorkItemToolbar?.(root, project, state);
  const list = root.querySelector("[data-field='workItems']");
  if (!allItems.length) {
    list.innerHTML = `<div class="work-item-empty"><strong>Nenhuma atividade registrada</strong><span>Comece pela Análise de Requisitos e vincule as próximas etapas.</span></div>`;
    return;
  }
  let visible = state.workItemFilter === "archived"
    ? archivedItems
    : activeItems.filter((item) => state.workItemFilter === "all" || item.type === state.workItemFilter);
  if (state.attentionFilter) visible = visible.filter((item) => workItemMatchesAttention(item, state.attentionFilter));
  if (window.matchesWorkspaceSearch) visible = visible.filter(item => matchesWorkspaceSearch(item, state));
  const resultCount = root.querySelector('[data-field="activityResultCount"]');
  if (resultCount) resultCount.textContent = `${visible.length} atividade${visible.length === 1 ? '' : 's'}`;
  if (state.workItemView === "grouped") {
    renderWorkItemGroups(list, visible, allItems, project, state.workItemFilter);
    return;
  }
  if (state.workItemView === "kanban") {
    renderWorkItemKanban(list, visible, allItems, project, state);
    return;
  }
  if (state.workItemView === "status") {
    renderWorkItemsByStatus(list, visible, allItems, project);
    return;
  }
  list.className = "work-item-list";
  const listItems = orderWorkItemsAsTree(visible, allItems, state.workItemFilter);
  list.innerHTML = listItems.map(({ item, depth }) => workItemRowHtml(item, depth, allItems, project)).join("") || `<p class="hint">Nenhuma atividade neste filtro.</p>`;
  bindWorkItemActions(list, allItems, project);
}

function workItemRowHtml(item, depth, allItems, project, showStage = true) {
  const parent = allItems.find((candidate) => candidate.id === item.parentId);
  const childCount = allItems.filter((candidate) => candidate.parentId === item.id).length;
  return `<article class="work-item-row type-${item.type} tree-depth-${depth}" style="--tree-depth:${depth}" data-work-item-id="${escapeHtml(item.id)}">
    ${workItemMenuHtml(item)}
    <div class="work-item-kind">${escapeHtml(workItemTypes[item.type] || item.type)}</div>
    <div class="work-item-main">
      <div class="work-item-title-line"><h4>${escapeHtml(item.title)}</h4>${showStage ? statusPillHtml(project, item) : ""}</div>
      ${parent ? `<p class="work-item-parent">Vinculada a: ${escapeHtml(parent.title)}</p>` : ""}
      ${item.description ? `<div class="work-item-description markdown-content">${markdownBlock(item.description)}</div>` : ""}
    ${workItemManagementHtml(item)}
    </div>
    <div class="work-item-meta">${childCount ? `<span>${childCount} vinculada${childCount > 1 ? "s" : ""}</span>` : ""}
    </div>
  </article>`;
}

function renderWorkItemsByStatus(container, visible, allItems, project) {
  const groups = new Map();
  visible.forEach(item => {
    const stage = workItemStage(item);
    if (!groups.has(stage)) groups.set(stage, []);
    groups.get(stage).push(item);
  });
  const order = kanbanColumnOrder(project);
  const rank = stage => { const index = order.indexOf(stage); return index < 0 ? order.length : index; };
  const entries = [...groups.entries()].sort((a,b) => rank(a[0]) - rank(b[0]));
  container.className = "work-item-status-groups";
  container.innerHTML = entries.map(([stage, items]) => `<section class="work-item-status-group stage-${escapeHtml(stage)}">
    <div class="work-item-status-group-head"><h4>${escapeHtml(workItemStatusLabel(project, items[0]))}</h4><span>${items.length}</span></div>
    <div class="work-item-status-group-body">${items.map(item => workItemRowHtml(item, 0, allItems, project, false)).join("")}</div>
  </section>`).join("") || `<p class="hint">Nenhuma atividade neste filtro.</p>`;
  bindWorkItemActions(container, allItems, project);
}

function orderWorkItemsAsTree(visible, allItems, filter) {
  if (filter !== "all") return visible.map((item) => ({ item, depth: 0 }));
  const visibleIds = new Set(visible.map((item) => item.id));
  const childrenByParent = new Map();
  visible.forEach((item) => {
    if (!childrenByParent.has(item.parentId)) childrenByParent.set(item.parentId, []);
    childrenByParent.get(item.parentId).push(item);
  });
  const ordered = [];
  const visited = new Set();
  const appendBranch = (item, depth) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    ordered.push({ item, depth });
    (childrenByParent.get(item.id) || []).forEach((child) => appendBranch(child, depth + 1));
  };
  visible.filter((item) => !item.parentId || !visibleIds.has(item.parentId)).forEach((item) => appendBranch(item, 0));
  visible.forEach((item) => appendBranch(item, 0));
  return ordered;
}

function renderWorkItemGroups(container, visible, allItems, project, filter) {
  const parentType = filter === "bug" ? "technical-definition" : "requirement";
  const parents = allItems.filter((item) => item.type === parentType);
  const groups = parents.map((parent) => ({
    parent,
    children: visible.filter((item) => item.parentId === parent.id),
  })).filter((group) => group.children.length);
  const unlinked = visible.filter((item) => !parents.some((parent) => parent.id === item.parentId));
  if (unlinked.length) groups.push({ parent: null, children: unlinked });
  container.className = "work-item-groups";
  container.innerHTML = groups.map(({ parent, children }) => `<section class="work-item-group">
    <div class="work-item-group-head">
      <div>
        <span>${filter === "bug" ? "Definição Técnica" : "Análise de Requisitos"}</span>
        <h4>${escapeHtml(parent?.title || "Sem vínculo")}</h4>
      </div>
      <strong>${children.length}</strong>
    </div>
    <div class="work-item-group-body">${children.map((item) => `<article class="grouped-work-item type-${item.type}" data-work-item-id="${escapeHtml(item.id)}">
      ${workItemMenuHtml(item)}
      <button type="button" class="grouped-work-item-open" data-action="edit-work-item">
        <span>${escapeHtml(workItemTypes[item.type] || item.type)}</span>
        <strong>${escapeHtml(item.title)}</strong>
      </button>
      ${statusPillHtml(project, item)}
    </article>`).join("")}</div>
  </section>`).join("") || `<p class="hint">Nenhuma atividade neste filtro.</p>`;
  bindWorkItemActions(container, allItems, project);
}

function workItemStage(item) {
  if (["approved", "done", "closed"].includes(item.status)) return "done";
  if (item.status === "blocked") return "blocked";
  if (["backlog", "open"].includes(item.status)) return "backlog";
  if (["analysis", "definition", "ready-for-test", "testing", "fixing", "ready-for-retest"].includes(item.status)) return "progress";
  return item.status;
}

function workItemStatusLabel(project, item) {
  const stage = workItemStage(item);
  return (project.workItemColumns || []).find(column => column.id === stage)?.title
    || kanbanBuiltInColumns.find(column => column.id === stage)?.title
    || workItemStatuses[item.type]?.[item.status]
    || item.status;
}

function workItemWorkflowColumns(project, item = null, includeCurrent = true) {
  const custom = (project.workItemColumns || []).filter(column => !column.archived);
  const byId = new Map([...kanbanBuiltInColumns, ...custom].map(column => [column.id,column]));
  const activeStages = new Set((project.workItems || []).filter(candidate => !candidate.archived).map(workItemStage));
  const currentStage = includeCurrent && item?.status ? workItemStage(item) : null;
  const columns = kanbanColumnOrder(project).map(id => byId.get(id)).filter(Boolean).filter(column =>
    column.id.startsWith("custom-") || !custom.length || activeStages.has(column.id) || ["blocked","done"].includes(column.id) || column.id === currentStage);
  if (currentStage && !columns.some(column => column.id === currentStage)) {
    const current = (project.workItemColumns || []).find(column => column.id === currentStage);
    if (current) columns.push({...current,title:current.archived ? `${current.title} (lista arquivada)` : current.title});
  }
  return columns;
}

function workItemStatusOptions(project, item, includeCurrent = true) {
  const currentStage = workItemStage(item);
  return Object.fromEntries(workItemWorkflowColumns(project, item, includeCurrent).map(column => {
    const preserveValue = column.id === currentStage && Boolean(workItemStatuses[item.type]?.[item.status]);
    const value = preserveValue ? item.status : workItemStatusForStage(item.type, column.id);
    return [value,column.title];
  }).filter(([value]) => value));
}

function statusPillHtml(project, item) {
  const options = workItemStatusOptions(project, item);
  return `<details class="status-pill-menu">
    <summary class="work-status status-${escapeHtml(item.status)}" title="Mover para outra etapa" aria-label="Etapa: ${escapeHtml(workItemStatusLabel(project, item))}. Mover para outra etapa">${escapeHtml(workItemStatusLabel(project, item))}</summary>
    <div class="status-pill-popover">
      ${Object.entries(options).map(([value, label]) => `<button type="button" class="${value === item.status ? "active" : ""}" data-status="${escapeHtml(value)}">${escapeHtml(label)}</button>`).join("")}
    </div>
  </details>`;
}

function workItemMenuHtml(item) {
  return `<details class="work-item-menu">
    <summary title="Ações" aria-label="Ações">•••</summary>
    <div class="work-item-menu-popover">
      <button type="button" data-action="edit-work-item">Editar</button>
      ${!item.archived ? '<button type="button" data-action="move-work-item">Mover para…</button>' : ""}
      <button type="button" data-action="archive-work-item">${item.archived ? "Restaurar" : "Arquivar"}</button>
      <button type="button" class="danger-link" data-action="delete-work-item">Excluir</button>
    </div>
  </details>`;
}

function kanbanColumnMenuHtml(column) {
  return `<details class="work-item-menu kanban-column-menu">
    <summary title="Ações da lista" aria-label="Ações da lista">•••</summary>
    <div class="work-item-menu-popover">
      <button type="button" data-action="archive-kanban-column">${column.archived ? "Restaurar lista" : "Arquivar lista"}</button>
      <button type="button" class="danger-link" data-action="delete-kanban-column">Excluir lista</button>
    </div>
  </details>`;
}

async function setKanbanColumnArchived(projectId, column, archived) {
  const response = await fetch(`${appBasePath}/api/projects/${projectId}/work-item-columns/${column.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || `Nao foi possivel ${archived ? "arquivar" : "restaurar"} a lista.`);
    return;
  }
  await loadProjects();
}

async function deleteKanbanColumn(projectId, column) {
  if (!window.confirm(`Excluir a lista "${column.title}"?`)) return;
  const response = await fetch(`${appBasePath}/api/projects/${projectId}/work-item-columns/${column.id}`, { method: "DELETE" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    alert(body.error || "Nao foi possivel excluir a lista.");
    return;
  }
  await loadProjects();
}

async function submitKanbanColumn(project, title) {
  const trimmed = title.trim();
  if (!trimmed) return false;
  const response = await fetch(`${appBasePath}/api/projects/${project.id}/work-item-columns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: trimmed }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || "Nao foi possivel criar a lista.");
    return false;
  }
  await loadProjects();
  return true;
}

function workItemStatusForStage(type, stage) {
  if (String(stage).startsWith("custom-")) return stage;
  const mappings = {
    requirement: { backlog: "backlog", progress: "analysis", blocked: "blocked", done: "approved" },
    "technical-definition": { backlog: "backlog", progress: "definition", blocked: "blocked", done: "done" },
    bug: { backlog: "open", progress: "fixing", blocked: "blocked", done: "closed" },
  };
  return mappings[type]?.[stage] || null;
}

const kanbanBuiltInColumns = [
  { id: "backlog", title: "A fazer" },
  { id: "progress", title: "Em andamento" },
  { id: "done", title: "Concluído" },
];

function kanbanColumnOrder(project) {
  const customIds = (project.workItemColumns || []).filter((column) => !column.archived).map((column) => column.id);
  const availableIds = [...kanbanBuiltInColumns.map((column) => column.id), ...customIds];
  const stored = (project.workItemColumnOrder || []).filter((id) => availableIds.includes(id));
  return [...stored, ...availableIds.filter((id) => !stored.includes(id))];
}

function syncKanbanViewport() {
  const board = document.querySelector('.kanban-workspace .work-item-kanban');
  if (board) board.style.height = `${Math.max(260, window.innerHeight - board.getBoundingClientRect().top - 20)}px`;
  const panel = document.querySelector('.kanban-sidepanel:not([hidden])');
  if (panel) panel.style.maxHeight = `${Math.max(260,window.innerHeight-panel.getBoundingClientRect().top-20)}px`;
}
window.addEventListener('resize', syncKanbanViewport);

function kanbanAssigneeKey(item) {
  return item.assigneeId ? `id:${item.assigneeId}` : item.assignee?.trim() ? `name:${item.assignee.trim()}` : 'unassigned';
}

function renderWorkItemKanban(container, visible, allItems, project, state) {
  state.kanbanOwners ||= {};
  const owners = new Map(allItems.filter(item => !item.archived).map(item => [kanbanAssigneeKey(item), item.assignee || 'Sem responsável']));
  owners.set('unassigned', 'Sem responsável');
  const ownerOptions = [...owners].sort((a,b) => a[1].localeCompare(b[1], 'pt-BR'));
  const customColumns = project.workItemColumns || [];
  const customById = new Map(customColumns.filter((column) => !column.archived).map((column) => [column.id, column]));
  const builtInById = new Map(kanbanBuiltInColumns.map((column) => [column.id, column]));
  const columns = kanbanColumnOrder(project).map((id) => customById.has(id)
    ? { ...customById.get(id), custom: true }
    : { ...builtInById.get(id), custom: false }).filter(column => column.custom || !customById.size || visible.some(item => workItemStage(item) === column.id));
  const archivedColumns = customColumns.filter((column) => column.archived);
  container.className = "work-item-kanban";
  container.innerHTML = columns.map((column) => {
    const columnItems = visible.filter(item => workItemStage(item) === column.id);
    const owner = state.kanbanOwners[column.id] || '';
    const cards = columnItems.filter(item => !owner || kanbanAssigneeKey(item) === owner);
    return `<section class="kanban-column stage-${column.id}" data-kanban-stage="${escapeHtml(column.id)}">
      <div class="kanban-column-toolbar"><div class="kanban-column-head" draggable="true"><h4>${escapeHtml(column.title)}</h4><span title="Atividades visíveis nesta lista">${owner ? `${cards.length}/${columnItems.length}` : cards.length}</span>${column.custom ? kanbanColumnMenuHtml(column) : ""}</div>
      <label class="kanban-owner-filter ${owner ? 'is-filtered' : ''}"><span>Responsável</span><select data-column-owner="${escapeHtml(column.id)}" aria-label="Responsável na lista ${escapeHtml(column.title)}"><option value="">Todos</option>${ownerOptions.map(([key,name]) => `<option value="${escapeHtml(key)}" ${key === owner ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label></div>
      <div class="kanban-column-body">${cards.map((item) => {
        const parent = allItems.find((candidate) => candidate.id === item.parentId);
        const childCount = allItems.filter((candidate) => candidate.parentId === item.id).length;
        return `<article draggable="true" class="kanban-card type-${item.type}" data-work-item-id="${escapeHtml(item.id)}">
          ${workItemMenuHtml(item)}
          <button type="button" class="kanban-card-open" data-action="edit-work-item">
            <span class="kanban-kind">${escapeHtml(workItemTypes[item.type] || item.type)}</span>
            ${item.type === 'bug' ? `<span class="bug-severity severity-${escapeHtml(item.severity || 'medium')}">${({low:'Baixa',medium:'Moderada',high:'Alta',critical:'Crítica'})[item.severity || 'medium']}</span>` : ''}
            <strong>${escapeHtml(item.title)}</strong>
          </button>
          ${workItemManagementHtml(item)}
          ${parent ? `<small class="kanban-card-parent">${escapeHtml(parent.title)}</small>` : ""}
          ${childCount ? `<small class="kanban-card-children">${childCount} vinculada${childCount > 1 ? "s" : ""}</small>` : ""}
        </article>`;
      }).join("") || `<span class="kanban-empty">Sem atividades</span>`}
      <button type="button" class="kanban-add" data-action="kanban-add" data-stage="${escapeHtml(column.id)}">Adicionar cartão</button></div>
    </section>`;
  }).join("")
  + (state.kanbanAddListOpen
    ? `<form class="kanban-list-composer" data-action="kanban-add-list-form">
        <input type="text" name="title" placeholder="Nome da lista" data-field="kanbanNewListInput" autocomplete="off" maxlength="60" />
        <div class="kanban-list-composer-actions">
          <button type="submit">Adicionar lista</button>
          <button type="button" class="kanban-list-composer-cancel" data-action="cancel-add-list" title="Cancelar" aria-label="Cancelar">✕</button>
        </div>
      </form>`
    : `<button type="button" class="kanban-add-list-trigger" data-action="open-add-list">+ Adicionar lista</button>`)
  + (archivedColumns.length
    ? (state.kanbanArchivedOpen
      ? `<div class="kanban-archived-panel">
          <div class="kanban-archived-panel-head"><span>Listas arquivadas</span><button type="button" data-action="toggle-archived-lists" aria-label="Fechar">✕</button></div>
          ${archivedColumns.map((column) => `<div class="kanban-archived-row" data-kanban-stage="${escapeHtml(column.id)}">
            <span>${escapeHtml(column.title)}</span>
            <button type="button" data-action="restore-kanban-column">Restaurar</button>
          </div>`).join("")}
        </div>`
      : `<button type="button" class="kanban-archived-trigger" data-action="toggle-archived-lists">Listas arquivadas (${archivedColumns.length})</button>`)
    : "");
  container.querySelectorAll('[data-column-owner]').forEach(select => select.addEventListener('change', () => {
    const left = container.scrollLeft;
    const top = container.scrollTop;
    const stage = select.dataset.columnOwner;
    const positions = new Map([...container.querySelectorAll('.kanban-column')].map(column => [column.dataset.kanbanStage, column.querySelector('.kanban-column-body').scrollTop]));
    state.kanbanOwners[stage] = select.value;
    renderWorkItemKanban(container, visible, allItems, project, state);
    container.scrollLeft = left;
    container.scrollTop = top;
    container.querySelectorAll('.kanban-column').forEach(column => { column.querySelector('.kanban-column-body').scrollTop = positions.get(column.dataset.kanbanStage) || 0; });
    [...container.querySelectorAll('[data-column-owner]')].find(input => input.dataset.columnOwner === stage)?.focus({preventScroll:true});
  }));
  bindWorkItemActions(container, allItems, project);
  container.querySelectorAll("[data-action='kanban-add']").forEach((button) => button.addEventListener("click", () => {
    const preferredType = ["requirement", "technical-definition", "bug"].includes(filterForProject(project)) ? filterForProject(project) : "requirement";
    openWorkItemEditor(project, null, button.dataset.stage, preferredType);
  }));
  enableKanbanDragging(container, allItems, project);
  enableKanbanColumnDragging(container, project);

  container.querySelectorAll("[data-action='archive-kanban-column']").forEach((button) => button.addEventListener("click", async () => {
    const columnId = button.closest("[data-kanban-stage]").dataset.kanbanStage;
    const column = customColumns.find((candidate) => candidate.id === columnId);
    if (column) await setKanbanColumnArchived(project.id, column, !column.archived);
  }));
  container.querySelectorAll("[data-action='delete-kanban-column']").forEach((button) => button.addEventListener("click", async () => {
    const columnId = button.closest("[data-kanban-stage]").dataset.kanbanStage;
    const column = customColumns.find((candidate) => candidate.id === columnId);
    if (column) await deleteKanbanColumn(project.id, column);
  }));
  container.querySelectorAll("[data-action='restore-kanban-column']").forEach((button) => button.addEventListener("click", async () => {
    const columnId = button.closest("[data-kanban-stage]").dataset.kanbanStage;
    const column = customColumns.find((candidate) => candidate.id === columnId);
    if (column) await setKanbanColumnArchived(project.id, column, false);
  }));
  container.querySelectorAll("[data-action='toggle-archived-lists']").forEach((button) => button.addEventListener("click", () => {
    state.kanbanArchivedOpen = !state.kanbanArchivedOpen;
    renderProjectDetail(project);
  }));

  const trigger = container.querySelector("[data-action='open-add-list']");
  if (trigger) trigger.addEventListener("click", () => {
    state.kanbanAddListOpen = true;
    renderProjectDetail(project);
  });
  const composerForm = container.querySelector("[data-action='kanban-add-list-form']");
  if (composerForm) {
    const input = composerForm.querySelector("[data-field='kanbanNewListInput']");
    input.focus();
    const closeComposer = () => {
      state.kanbanAddListOpen = false;
      renderProjectDetail(project);
    };
    composerForm.querySelector("[data-action='cancel-add-list']").addEventListener("click", closeComposer);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeComposer();
    });
    composerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const created = await submitKanbanColumn(project, input.value);
      if (created) state.kanbanAddListOpen = false;
    });
  }
}

function filterForProject(project) {
  return projectUiState.get(project.id)?.workItemFilter || "all";
}

function enableKanbanDragging(container, allItems, project) {
  let draggedId = null;
  container.querySelectorAll(".kanban-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      draggedId = card.dataset.workItemId;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedId);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      container.querySelectorAll(".kanban-column").forEach((column) => column.classList.remove("drag-over"));
      draggedId = null;
    });
  });
  container.querySelectorAll(".kanban-column").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      if (event.dataTransfer.types.includes("application/x-kanban-column")) return;
      event.preventDefault();
      column.classList.add("drag-over");
      event.dataTransfer.dropEffect = "move";
    });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", async (event) => {
      if (event.dataTransfer.types.includes("application/x-kanban-column")) return;
      event.preventDefault();
      column.classList.remove("drag-over");
      const id = draggedId || event.dataTransfer.getData("text/plain");
      const item = allItems.find((candidate) => candidate.id === id);
      const status = workItemStatusForStage(item?.type, column.dataset.kanbanStage);
      if (!item || !status || item.status === status) return;
      await updateWorkItemStatus(project.id, item, status);
    });
  });
}

function enableKanbanColumnDragging(container, project) {
  let draggedColumnId = null;
  container.querySelectorAll(".kanban-column-head").forEach((head) => {
    const column = head.closest(".kanban-column");
    head.addEventListener("dragstart", (event) => {
      draggedColumnId = column.dataset.kanbanStage;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-kanban-column", draggedColumnId);
      column.classList.add("column-dragging");
    });
    head.addEventListener("dragend", () => {
      container.querySelectorAll(".kanban-column").forEach((candidate) => candidate.classList.remove("column-dragging", "column-drag-over"));
      draggedColumnId = null;
    });
  });
  container.querySelectorAll(".kanban-column").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      if (!event.dataTransfer.types.includes("application/x-kanban-column")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      column.classList.add("column-drag-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("column-drag-over"));
    column.addEventListener("drop", async (event) => {
      if (!event.dataTransfer.types.includes("application/x-kanban-column")) return;
      event.preventDefault();
      column.classList.remove("column-drag-over");
      const targetId = column.dataset.kanbanStage;
      if (!draggedColumnId || draggedColumnId === targetId) return;
      await reorderKanbanColumns(project, draggedColumnId, targetId);
    });
  });
}

async function reorderKanbanColumns(project, draggedId, targetId) {
  const order = kanbanColumnOrder(project);
  if (!order.includes(draggedId) || !order.includes(targetId)) return;
  const nextOrder = order.filter((id) => id !== draggedId);
  nextOrder.splice(nextOrder.indexOf(targetId), 0, draggedId);
  const response = await fetch(`${appBasePath}/api/projects/${project.id}/work-item-column-order`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: nextOrder }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || "Nao foi possivel reordenar as listas.");
    return;
  }
  await loadProjects();
}

async function updateWorkItemStatus(projectId, item, status) {
  const response = await fetch(`${appBasePath}/api/projects/${projectId}/work-items/${item.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...item, status }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || "Nao foi possivel mover a atividade.");
    return;
  }
  await loadProjects();
}

function bindWorkItemActions(container, allItems, project) {
  container.querySelectorAll("[data-action='move-work-item']").forEach(button => button.addEventListener("click", () => {
    const id = button.closest("[data-work-item-id]").dataset.workItemId;
    const item = allItems.find(candidate => candidate.id === id);
    if (!item) return;
    openWorkItemEditor(project, item);
    workItemStatus.focus();
  }));
  container.querySelectorAll("[data-action='edit-work-item']").forEach((button) => button.addEventListener("click", () => {
    const id = button.closest("[data-work-item-id]").dataset.workItemId;
    openWorkItemEditor(project, allItems.find((item) => item.id === id));
  }));
  container.querySelectorAll("[data-action='archive-work-item']").forEach((button) => button.addEventListener("click", async () => {
    const id = button.closest("[data-work-item-id]").dataset.workItemId;
    const item = allItems.find((candidate) => candidate.id === id);
    if (item) await setWorkItemArchived(project.id, item, !item.archived);
  }));
  container.querySelectorAll("[data-action='delete-work-item']").forEach((button) => button.addEventListener("click", async () => {
    const id = button.closest("[data-work-item-id]").dataset.workItemId;
    const item = allItems.find((candidate) => candidate.id === id);
    if (item) await deleteWorkItem(project.id, item, allItems);
  }));
  container.querySelectorAll(".status-pill-popover button").forEach((button) => button.addEventListener("click", async () => {
    const details = button.closest(".status-pill-menu");
    details.open = false;
    const id = button.closest("[data-work-item-id]").dataset.workItemId;
    const item = allItems.find((candidate) => candidate.id === id);
    const status = button.dataset.status;
    if (item && status && status !== item.status) await updateWorkItemStatus(project.id, item, status);
  }));
}

async function setWorkItemArchived(projectId, item, archived) {
  const response = await fetch(`${appBasePath}/api/projects/${projectId}/work-items/${item.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...item, archived }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || `Nao foi possivel ${archived ? "arquivar" : "restaurar"} a atividade.`);
    return;
  }
  await loadProjects();
}

async function deleteWorkItem(projectId, item, allItems) {
  const branch = new Set([item.id]);
  let changed = true;
  while (changed) {
    const size = branch.size;
    allItems.forEach((candidate) => {
      if (branch.has(candidate.parentId)) branch.add(candidate.id);
    });
    changed = branch.size !== size;
  }
  const dependents = branch.size - 1;
  const warning = dependents ? ` Esta ação também excluirá ${dependents} atividade(s) vinculada(s).` : "";
  if (!window.confirm(`Excluir ${item.title}?${warning}`)) return;
  const response = await fetch(`${appBasePath}/api/projects/${projectId}/work-items/${item.id}`, { method: "DELETE" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    alert(body.error || "Nao foi possivel excluir a atividade.");
    return;
  }
  await loadProjects();
}

function updateWorkItemFormOptions(project, selectedParentId = "") {
  const type = workItemType.value;
  document.querySelector('#bugReportFields').hidden = type !== 'bug';
  document.querySelector('#technicalArtifactsFields').hidden = type !== 'technical-definition';
  const editingItem = (project.workItems || []).find(item => item.id === editingWorkItemId);
  const previousStatus = editingItem?.status || (pendingWorkItemStage ? workItemStatusForStage(type, pendingWorkItemStage) : workItemStatus.value);
  const sample = {type,status:previousStatus || Object.keys(workItemStatuses[type] || {})[0]};
  const statuses = workItemStatusOptions(project, sample, Boolean(editingItem || pendingWorkItemStage));
  workItemStatus.innerHTML = Object.entries(statuses).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  if (statuses[previousStatus]) workItemStatus.value = previousStatus;
  const parentType = type === "technical-definition" ? "requirement" : type === "bug" ? "technical-definition" : null;
  workItemParentField.hidden = !parentType;
  if (!parentType) return;
  workItemParentLabel.textContent = type === "bug" ? "Definição Técnica vinculada" : "Análise de Requisitos vinculada";
  const parents = (project.workItems || []).filter((item) => item.type === parentType);
  workItemParent.innerHTML = `<option value="">Selecione</option>${parents.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join("")}`;
  workItemParent.value = selectedParentId || "";
}

const sourceCodeTypeLabels = { frontend: "Frontend", backend: "Backend", service: "Serviço" };

function renderEditorSourceCodeLinks() {
  sourceCodeLinksList.innerHTML = editorSourceCodeLinks.map((entry, index) => {
    const typesUsedElsewhere = new Set(editorSourceCodeLinks.filter((_, otherIndex) => otherIndex !== index).map((other) => other.type).filter(Boolean));
    return `<div class="source-code-link-row">
      <label>Tipo<select data-source-type="${index}" aria-label="Tipo do código ${index + 1}"><option value="">Selecione</option>${Object.entries(sourceCodeTypeLabels).map(([value, label]) => `<option value="${value}" ${entry.type === value ? "selected" : ""} ${typesUsedElsewhere.has(value) ? "disabled" : ""}>${label}</option>`).join("")}</select></label>
      <label>Repositório ou caminho<input type="url" data-source-url="${index}" aria-label="Link do código ${entry.type ? sourceCodeTypeLabels[entry.type] : index + 1}" placeholder="https://github.com/organizacao/repositorio/..." value="${escapeHtml(entry.url || "")}" /></label>
      <button type="button" class="source-code-remove" data-remove-source="${index}" aria-label="Remover link de código ${index + 1}">Remover</button>
    </div>`;
  }).join("");
  addSourceCodeLinkButton.disabled = editorSourceCodeLinks.length >= 3;
  addSourceCodeLinkButton.textContent = `+ Adicionar código (${editorSourceCodeLinks.length}/3)`;
}

addSourceCodeLinkButton.addEventListener("click", () => {
  if (editorSourceCodeLinks.length >= 3) return;
  editorSourceCodeLinks.push({ type: "", url: "" });
  renderEditorSourceCodeLinks();
  sourceCodeLinksList.querySelector(`[data-source-type="${editorSourceCodeLinks.length - 1}"]`)?.focus();
});
sourceCodeLinksList.addEventListener("input", (event) => {
  const index = Number(event.target.dataset.sourceUrl);
  if (Number.isInteger(index) && editorSourceCodeLinks[index]) editorSourceCodeLinks[index].url = event.target.value;
});
sourceCodeLinksList.addEventListener("change", (event) => {
  const index = Number(event.target.dataset.sourceType);
  if (!Number.isInteger(index) || !editorSourceCodeLinks[index]) return;
  editorSourceCodeLinks[index].type = event.target.value;
  renderEditorSourceCodeLinks();
  sourceCodeLinksList.querySelector(`[data-source-type="${index}"]`)?.focus();
});
sourceCodeLinksList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-source]");
  if (!button) return;
  editorSourceCodeLinks.splice(Number(button.dataset.removeSource), 1);
  renderEditorSourceCodeLinks();
});

function openWorkItemEditor(project, item = null, stage = null, preferredType = null) {
  workItemProjectId = project.id;
  editingWorkItemId = item?.id || null;
  editingWorkItemRev = item?.rev || 0;
  workItemForm.reset();
  workItemModalTitle.textContent = item ? "Editar atividade" : "Nova atividade";
  pendingWorkItemStage = stage;
  workItemType.value = item?.type || preferredType || "requirement";
  updateWorkItemFormOptions(project, item?.parentId || "");
  if (item) workItemStatus.value = item.status;
  else if (stage) workItemStatus.value = workItemStatusForStage(workItemType.value, stage);
  workItemTitle.value = item?.title || "";
  setRichDescriptionValue(item?.description || "");
  document.querySelector('#workItemSeverity').value = item?.severity || 'medium';
  document.querySelector('#workItemEnvironment').value = item?.environment || '';
  document.querySelector('#workItemReproductionSteps').value = item?.reproductionSteps || '';
  document.querySelector('#workItemExpectedResult').value = item?.expectedResult || '';
  document.querySelector('#workItemActualResult').value = item?.actualResult || '';
  editorSourceCodeLinks = structuredClone(item?.sourceCodeLinks || (item?.sourcePath ? [{ type: "", url: item.sourcePath }] : []));
  renderEditorSourceCodeLinks();
  document.querySelector('#workItemDeploymentPath').value = item?.deploymentPath || '';
  document.querySelector('#workItemBlocked').checked = Boolean(item?.blocked);
  for (const field of ["assignee", "priority", "dueDate", "nextAction", "blockedReason", "acceptanceCriteria"]) {
    if (field === "assignee") { populateCardAssignees(item); continue; }
    document.getElementById(`workItem${field[0].toUpperCase()}${field.slice(1)}`).value = item?.[field] || (field === "priority" ? "normal" : "");
  }
  editorChecklist = structuredClone(item?.checklist || []);
  renderEditorChecklist();
  resetEvidenceDraft();
  commentReplyTo = null;
  document.querySelector("#commentText").value = "";
  document.querySelector("#sendComment").disabled = !authState.user || authState.user.mustChangePassword;
  document.querySelector("#commentAuthor").textContent = authState.user ? `Enviando como ${authState.user.name} (${authState.user.email})` : "Entre para enviar mensagens.";
  window.resetCommentMentions?.();
  document.querySelector("#workItemCollaboration").hidden = !item;
  document.querySelector("#collaborationSaveHint").hidden = Boolean(item);
  renderCollaboration(item);
  workItemType.disabled = Boolean(item);
  deleteWorkItemButton.hidden = !item;
  workItemModal.hidden = false;
  resetEditorWorkspace(project, item);
}

function closeWorkItemEditor() {
  if (collaborationBusy) return;
  if (editorHasUnsavedChanges() && !window.confirm("Descartar as alterações e os anexos ainda não enviados?")) return;
  resetEvidenceDraft();
  workItemModal.hidden = true;
  editingWorkItemId = null;
  workItemProjectId = null;
  workItemType.disabled = false;
  pendingWorkItemStage = null;
}

function renderCurrentView() {
  const selectedProject = projectsCache.find((project) => project.id === selectedProjectId);
  if (selectedProject && !isStudyProject(selectedProject)) {
    renderProjectDetail(selectedProject);
    return;
  }
  selectedProjectId = null;
  localStorage.removeItem("selectedProjectId");
  renderDashboard(projectsCache);
}

function openProject(id) {
  const state = projectUiState.get(id);
  if (state) state.workItemView = getStoredWorkItemView();
  managerAssistantPanel.hidden = true;
  selectedProjectId = id;
  localStorage.setItem("selectedProjectId", id);
  renderCurrentView();
}

function showDashboard() {
  managerAssistantPanel.hidden = true;
  managerAssistantHistory = [];
  selectedProjectId = null;
  localStorage.removeItem("selectedProjectId");
  renderCurrentView();
}

function projectExecutiveStatus(project) {
  if (isStudyProject(project)) return { label: "Em estudo", className: "study" };
  if (isConstructionProject(project)) return { label: "Em construção", className: "construction" };
  const { dashboard, variance } = getDashboardNumbers(project);
  const label = dashboard.status === "parsed" ? projectRiskLabel(dashboard, variance) : "Falha de leitura";
  const className = label === "Atrasado" ? "late" : label === "Atenção" ? "risk" : dashboard.status === "parsed" ? "ok" : "error";
  return { label, className };
}

function executiveRecommendation(project) {
  if (isStudyProject(project)) return "Definir escopo, prioridade e próximo marco de decisão.";
  if (isConstructionProject(project)) return "Vincular cronograma para iniciar acompanhamento de prazo e avanço.";

  const { dashboard, variance } = getDashboardNumbers(project);
  if (dashboard.status !== "parsed") return dashboard.message || "Revisar origem do cronograma.";
  if ((dashboard.lateTasks ?? 0) > 0) return "Revisar plano de recuperação das atividades atrasadas.";
  if ((dashboard.attentionTasks ?? 0) > 0 || variance < 0) return "Monitorar desvios e confirmar responsáveis pelos próximos marcos.";
  return "Manter acompanhamento do plano atual.";
}

function executiveReportRows(projects) {
  return projects.map((project) => {
    const { dashboard, realized, planned, variance, selectedFile } = getDashboardNumbers(project);
    const status = projectExecutiveStatus(project);
    const notes = isStudyProject(project) ? project.description : project.notes;
    return `
      <tr>
        <td><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(selectedFile?.name || projectSource(project) || "Sem cronograma vinculado")}</small></td>
        <td><span class="report-status ${status.className}">${status.label}</span></td>
        <td>${isStudyProject(project) || isConstructionProject(project) ? "-" : `${planned}%`}</td>
        <td>${isStudyProject(project) || isConstructionProject(project) ? "-" : `${realized}%`}</td>
        <td>${isStudyProject(project) || isConstructionProject(project) ? "-" : `${variance > 0 ? "+" : ""}${variance} p.p.`}</td>
        <td>${dashboard.lateTasks ?? 0}</td>
        <td>${dashboard.attentionTasks ?? 0}</td>
        <td>${escapeHtml(executiveRecommendation(project))}${notes ? `<div class="report-note markdown-content">${markdownBlock(notes)}</div>` : ""}</td>
      </tr>
    `;
  }).join("");
}

function buildExecutiveReport() {
  const ordered = orderedDashboardProjects(projectsCache);
  const projects = ordered.projects;
  const studies = ordered.studies;
  const parsedProjects = projects.filter((project) => project.dashboard?.status === "parsed");
  const lateProjects = parsedProjects.filter((project) => (project.dashboard?.lateTasks ?? 0) > 0);
  const riskProjects = parsedProjects.filter((project) => {
    const { dashboard, variance } = getDashboardNumbers(project);
    return (dashboard.attentionTasks ?? 0) > 0 || variance < 0;
  });
  const constructionProjects = projects.filter(isConstructionProject);
  const okProjects = parsedProjects.filter((project) => projectExecutiveStatus(project).className === "ok");
  const avg = (items, picker) => items.length ? Math.round(items.reduce((sum, item) => sum + picker(item), 0) / items.length) : 0;
  const averagePlanned = avg(parsedProjects, (project) => getDashboardNumbers(project).planned);
  const averageRealized = avg(parsedProjects, (project) => getDashboardNumbers(project).realized);
  const averageVariance = averageRealized - averagePlanned;
  const generatedAt = formatDate(new Date().toISOString(), true);

  executiveReport.innerHTML = `
    <header class="report-cover">
      <span>Portal E-Cargo</span>
      <h1>Relatório executivo de evolutivas</h1>
      <p>Visão consolidada para acompanhamento gerencial. Gerado em ${generatedAt}.</p>
    </header>

    <section class="report-section">
      <h2>Resumo da carteira</h2>
      <div class="report-kpis">
        <div><span>Evolutivas acompanhadas</span><strong>${projects.length}</strong></div>
        <div><span>Em dia</span><strong>${okProjects.length}</strong></div>
        <div><span>Atrasados</span><strong>${lateProjects.length}</strong></div>
        <div><span>Em atenção</span><strong>${riskProjects.length}</strong></div>
        <div><span>Em construção</span><strong>${constructionProjects.length}</strong></div>
        <div><span>Em estudo</span><strong>${studies.length}</strong></div>
      </div>
      <p class="report-summary-line">Consolidado das evolutivas com cronograma: planejado ${averagePlanned}%, realizado ${averageRealized}%, desvio ${averageVariance > 0 ? "+" : ""}${averageVariance} p.p.</p>
    </section>

    <section class="report-section">
      <h2>Evolutivas</h2>
      ${projects.length ? `<table class="report-table">
        <thead>
          <tr>
            <th>Evolutiva</th>
            <th>Status</th>
            <th>Plan.</th>
            <th>Real.</th>
            <th>Desvio</th>
            <th>Atrasos</th>
            <th>Atenção</th>
            <th>Direcionamento executivo</th>
          </tr>
        </thead>
        <tbody>${executiveReportRows(projects)}</tbody>
      </table>` : `<p class="report-empty">Nenhuma evolutiva cadastrada.</p>`}
    </section>

    <section class="report-section">
      <h2>Estudos</h2>
      ${studies.length ? `<table class="report-table studies-table">
        <thead>
          <tr>
            <th>Estudo</th>
            <th>Status</th>
            <th>Direcionamento executivo</th>
          </tr>
        </thead>
        <tbody>${studies.map((project) => `
          <tr>
            <td><strong>${escapeHtml(project.name)}</strong></td>
            <td><span class="report-status study">Em estudo</span></td>
            <td><div class="markdown-content">${markdownBlock(project.description || executiveRecommendation(project))}</div></td>
          </tr>
        `).join("")}</tbody>
      </table>` : `<p class="report-empty">Nenhum estudo cadastrado.</p>`}
    </section>
  `;
}

function exportDashboardPdf() {
  if (selectedProjectId) {
    showDashboard();
  }
  buildExecutiveReport();
  executiveReport.setAttribute("aria-hidden", "false");
  document.body.classList.add("print-report");
  requestAnimationFrame(() => {
    window.print();
  });
}

async function loadProjects() {
  refreshButton.disabled = true;
  try {
    const response = await fetch(`${appBasePath}/api/projects`);
    const projects = await response.json();
    if (!response.ok) throw new Error(projects.error || "Falha ao carregar evolutivas.");
    projectsCache = projects;
    if (editingWorkItemId && !collaborationBusy) renderCollaboration(collaborationItem());
    renderCurrentView();
    lastUpdate.textContent = `Última verificação: ${formatDate(new Date().toISOString(), true)}`;
  } catch (error) {
    projectsEl.innerHTML = `<p class="hint">${error.message}</p>`;
  } finally {
    refreshButton.disabled = false;
  }
}

async function deleteProject(id) {
  const project = projectsCache.find((item) => item.id === id);
  if (!window.confirm(`Excluir ${project?.name || "esta evolutiva"}?`)) return;
  await fetch(`${appBasePath}/api/projects/${id}`, { method: "DELETE" });
  if (selectedProjectId === id) {
    selectedProjectId = null;
    localStorage.removeItem("selectedProjectId");
  }
  projectUiState.delete(id);
  await loadProjects();
}

function chooseScheduleUpdate(projectId) {
  scheduleUpdateProjectId = projectId;
  scheduleUpdateInput.value = "";
  scheduleUpdateInput.click();
}

async function updateProjectSchedule(file) {
  if (!scheduleUpdateProjectId || !file) return;
  if (!/\.(xml|mpp|mpt)$/i.test(file.name)) {
    alert("Envie um cronograma .xml, .mpp ou .mpt.");
    return;
  }

  refreshButton.disabled = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${appBasePath}/api/projects/${scheduleUpdateProjectId}/upload`, {
      method: "POST",
      body: formData,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(body.error || "Nao foi possivel atualizar o cronograma.");
      return;
    }
    await loadProjects();
  } finally {
    refreshButton.disabled = false;
  }
}

async function loadSettings() {
  try {
    const response = await fetch(`${appBasePath}/api/project-settings`);
    if (!response.ok) return;
    projectSettings = await response.json();
  } finally {
    updateCriteriaText();
    updateWorkPlanUploadStatus();
  }
}

async function uploadWorkPlanImage(file) {
  if (!file) return;
  if (!/\.(png|jpe?g|webp)$/i.test(file.name)) {
    alert("Envie uma imagem .png, .jpg, .jpeg ou .webp.");
    return;
  }

  workPlanImageInput.disabled = true;
  workPlanUploadStatus.textContent = `Enviando ${file.name}...`;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${appBasePath}/api/project-settings/plan-image`, {
      method: "POST",
      body: formData,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(body.error || "Nao foi possivel enviar a imagem.");
      return;
    }
    projectSettings = body;
    updateWorkPlanUploadStatus();
    renderCurrentView();
  } finally {
    workPlanImageInput.disabled = false;
    workPlanImageInput.value = "";
  }
}

async function deleteWorkPlanImage() {
  if (!projectSettings.workPlanImage) return;
  if (!window.confirm("Excluir a imagem atual do plano de trabalho?")) return;

  deleteWorkPlanImageButton.disabled = true;
  try {
    const response = await fetch(`${appBasePath}/api/project-settings/plan-image`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(body.error || "Nao foi possivel excluir a imagem.");
      return;
    }
    projectSettings = body;
    updateWorkPlanUploadStatus();
    renderCurrentView();
  } finally {
    deleteWorkPlanImageButton.disabled = false;
  }
}

function updateWorkPlanUploadStatus() {
  const image = projectSettings.workPlanImage;
  if (!workPlanUploadStatus) return;
  workPlanUploadStatus.textContent = image?.name ? `Imagem atual: ${image.name}` : "Nenhuma imagem enviada.";
  if (deleteWorkPlanImageButton) {
    deleteWorkPlanImageButton.disabled = !image;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#projectName").value.trim();
  const source = document.querySelector("#folderPath").value.trim();
  const info = document.querySelector("#projectInfo").value.trim();
  const file = document.querySelector("#scheduleFile").files[0];
  let response;

  if (file) {
    if (!/\.(xml|mpp|mpt)$/i.test(file.name)) {
      alert("Envie um cronograma .xml, .mpp ou .mpt.");
      return;
    }
    const formData = new FormData();
    formData.append("name", name);
    formData.append("file", file);
    if (info) formData.append("notes", info);
    response = await fetch(`${appBasePath}/api/projects/upload`, {
      method: "POST",
      body: formData,
    });
  } else {
    const payload = { name };
    if (!source && !info) {
      alert("Informe uma pasta, URL do SharePoint, envie um arquivo ou preencha as informações da evolutiva.");
      return;
    }
    if (info) payload.notes = info;
    if (/^https?:\/\//i.test(source)) {
      payload.sharepointUrl = source;
    } else {
      payload.folderPath = source;
    }
    response = await fetch(`${appBasePath}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || "Nao foi possivel cadastrar a evolutiva.");
    return;
  }

  form.reset();
  selectedProjectId = null;
  localStorage.removeItem("selectedProjectId");
  await loadProjects();
});

studyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    title: document.querySelector("#studyTitle").value.trim(),
    description: document.querySelector("#studyDescription").value.trim(),
  };
  const response = await fetch(`${appBasePath}/api/projects/study`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || "Nao foi possivel cadastrar a evolutiva em estudo.");
    return;
  }
  studyForm.reset();
  studyFormPanel.hidden = true;
  selectedProjectId = null;
  localStorage.removeItem("selectedProjectId");
  await loadProjects();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    attentionDelayPercent: Number(attentionDelayInput.value || 0),
    negativeVarianceAttention: negativeVarianceInput.checked,
  };
  const response = await fetch(`${appBasePath}/api/project-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || "Nao foi possivel salvar o critério.");
    return;
  }
  projectSettings = body;
  updateCriteriaText();
  await loadProjects();
});

showProjectFormButton.addEventListener("click", () => {
  settingsModal.hidden = true;
  projectFormPanel.hidden = false;
  studyFormPanel.hidden = true;
});
hideProjectFormButton.addEventListener("click", () => {
  projectFormPanel.hidden = true;
});
showStudyFormButton.addEventListener("click", () => {
  settingsModal.hidden = true;
  studyFormPanel.hidden = false;
  projectFormPanel.hidden = true;
});
hideStudyFormButton.addEventListener("click", () => {
  studyFormPanel.hidden = true;
});
openSettingsButton.addEventListener("click", () => {
  settingsModal.hidden = false;
});
closeSettingsButton.addEventListener("click", () => {
  settingsModal.hidden = true;
});
openHelpButton.addEventListener("click", () => {
  helpModal.hidden = false;
});
closeHelpButton.addEventListener("click", () => {
  helpModal.hidden = true;
});
workPlanImageInput.addEventListener("change", async () => {
  await uploadWorkPlanImage(workPlanImageInput.files[0]);
});
deleteWorkPlanImageButton.addEventListener("click", deleteWorkPlanImage);

refreshButton.addEventListener("click", loadProjects);
exportDashboardButton.addEventListener("click", exportDashboardPdf);
window.addEventListener("resize", schedulePercentageAlignment);
function popoverFor(details) {
  return details.querySelector(":scope > .work-item-menu-popover, :scope > .status-pill-popover");
}

document.addEventListener("toggle", (event) => {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement)) return;
  const popover = popoverFor(details);
  if (!popover) return;
  if (!details.open) {
    popover.style.cssText = "";
    return;
  }
  const margin = 8;
  const summary = details.querySelector(":scope > summary");
  const anchor = (summary || details).getBoundingClientRect();
  popover.style.top = `${anchor.bottom + 4}px`;
  popover.style.left = `${anchor.left}px`;
  popover.style.right = "auto";
  popover.style.bottom = "auto";
  const rect = popover.getBoundingClientRect();
  if (rect.right > window.innerWidth - margin) {
    popover.style.left = "auto";
    popover.style.right = `${Math.max(margin, window.innerWidth - anchor.right)}px`;
  }
  if (rect.bottom > window.innerHeight - margin) {
    popover.style.top = "auto";
    popover.style.bottom = `${Math.max(margin, window.innerHeight - anchor.top + 4)}px`;
  }
}, true);

document.addEventListener("scroll", (event) => {
  document.querySelectorAll(".work-item-menu[open], .status-pill-menu[open]").forEach((details) => {
    if (details.contains(event.target)) return;
    details.open = false;
  });
}, true);

document.addEventListener("click", (event) => {
  document.querySelectorAll(".work-item-menu[open], .status-pill-menu[open]").forEach((details) => {
    if (details.contains(event.target)) return;
    details.open = false;
  });
});
window.addEventListener("afterprint", () => {
  document.body.classList.remove("print-report");
  executiveReport.setAttribute("aria-hidden", "true");
});
closeReportButton.addEventListener("click", () => {
  reportModal.hidden = true;
});
closeNotesButton.addEventListener("click", () => {
  notesModal.hidden = true;
  notesProjectId = null;
});
closeStudyEditButton.addEventListener("click", () => {
  studyEditModal.hidden = true;
  studyEditProjectId = null;
  editingProject = null;
});
workItemType.addEventListener("change", () => {
  const project = projectsCache.find((item) => item.id === workItemProjectId);
  if (project) {
    updateWorkItemFormOptions(project);
    if (pendingWorkItemStage) workItemStatus.value = workItemStatusForStage(workItemType.value, pendingWorkItemStage);
  }
});
closeWorkItemButton.addEventListener("click", closeWorkItemEditor);
workItemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (collaborationBusy) return;
  if (!workItemProjectId) return;
  const sourceCodeLinks = editorSourceCodeLinks.map(({ type, url }) => ({ type, url: url.trim() }));
  if (workItemType.value === "technical-definition") {
    if (sourceCodeLinks.some((entry) => !entry.type || !entry.url)) {
      alert("Preencha o tipo e o link em cada registro de código adicionado.");
      return;
    }
    if (new Set(sourceCodeLinks.map((entry) => entry.type)).size !== sourceCodeLinks.length) {
      alert("Use no máximo um registro para cada tipo: Frontend, Backend e Serviço.");
      return;
    }
  }
  syncRichDescriptionValue();
  const payload = {
    type: workItemType.value,
    status: workItemStatus.value,
    title: workItemTitle.value.trim(),
    description: workItemDescription.value.trim(),
    severity: document.querySelector('#workItemSeverity').value,
    environment: document.querySelector('#workItemEnvironment').value.trim(),
    reproductionSteps: document.querySelector('#workItemReproductionSteps').value.trim(),
    expectedResult: document.querySelector('#workItemExpectedResult').value.trim(),
    actualResult: document.querySelector('#workItemActualResult').value.trim(),
    sourceCodeLinks,
    deploymentPath: document.querySelector('#workItemDeploymentPath').value.trim(),
    parentId: workItemParentField.hidden ? null : workItemParent.value,
    blocked: document.querySelector('#workItemBlocked').checked,
    ...Object.fromEntries(["assignee", "priority", "dueDate", "nextAction", "blockedReason", "acceptanceCriteria"].map((field) => [field, document.getElementById(`workItem${field[0].toUpperCase()}${field.slice(1)}`).value.trim()])),
    checklist: editorChecklist,
    assigneeId: document.querySelector("#workItemAssignee").value.startsWith("local:") ? document.querySelector("#workItemAssignee").value : "",
  };
  if (editingWorkItemId) payload.expectedRev = editingWorkItemRev;
  const suffix = editingWorkItemId ? `/${editingWorkItemId}` : "";
  const response = await fetch(`${appBasePath}/api/projects/${workItemProjectId}/work-items${suffix}`, {
    method: editingWorkItemId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || "Nao foi possivel salvar a atividade.");
    if (response.status === 409) await loadProjects();
    return;
  }
  markEditorSaved();
  closeWorkItemEditor();
  await loadProjects();
});
deleteWorkItemButton.addEventListener("click", async () => {
  if (!workItemProjectId || !editingWorkItemId) return;
  const project = projectsCache.find((item) => item.id === workItemProjectId);
  const item = (project?.workItems || []).find((candidate) => candidate.id === editingWorkItemId);
  const children = (project?.workItems || []).filter((candidate) => candidate.parentId === editingWorkItemId).length;
  const warning = children ? ` Esta ação também excluirá ${children} atividade(s) vinculada(s).` : "";
  if (!window.confirm(`Excluir ${item?.title || "esta atividade"}?${warning}`)) return;
  const response = await fetch(`${appBasePath}/api/projects/${workItemProjectId}/work-items/${editingWorkItemId}`, { method: "DELETE" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    alert(body.error || "Nao foi possivel excluir a atividade.");
    return;
  }
  document.querySelector("#commentText").value = "";
  resetEvidenceDraft();
  markEditorSaved();
  closeWorkItemEditor();
  await loadProjects();
});
studyEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!studyEditProjectId || !editingProject) return;
  const payload = { title: studyEditName.value.trim() };
  if (isStudyProject(editingProject)) {
    payload.description = studyEditDescription.value.trim();
  }
  const response = await fetch(`${appBasePath}/api/projects/${studyEditProjectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || "Nao foi possivel salvar o cadastro.");
    return;
  }
  studyEditModal.hidden = true;
  studyEditProjectId = null;
  editingProject = null;
  await loadProjects();
});
saveNotesButton.addEventListener("click", async () => {
  if (!notesProjectId) return;
  const response = await fetch(`${appBasePath}/api/projects/${notesProjectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: projectNotes.value }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(body.error || "Nao foi possivel salvar as informações.");
    return;
  }
  notesModal.hidden = true;
  notesProjectId = null;
  await loadProjects();
});
scheduleUpdateInput.addEventListener("change", async () => {
  const file = scheduleUpdateInput.files[0];
  await updateProjectSchedule(file);
  scheduleUpdateProjectId = null;
});
copyReportButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(`${reportSubject.value}\n\n${reportBody.value}`);
  copyReportButton.title = "Copiado";
  copyReportButton.setAttribute("aria-label", "Copiado");
  setTimeout(() => {
    copyReportButton.title = "Copiar status report";
    copyReportButton.setAttribute("aria-label", "Copiar status report");
  }, 1600);
});
managerAssistantPanel.querySelector("[data-action='close-manager-assistant']").addEventListener("click", () => {
  if (managerAssistantBusy) return;
  managerAssistantPanel.hidden = true;
});
managerAssistantForm.addEventListener("submit", (event) => {
  event.preventDefault();
  askProjectManager(managerAssistantInput.value);
});
managerAssistantPanel.querySelectorAll("[data-manager-prompt]").forEach((button) => {
  button.addEventListener("click", () => askProjectManager(button.dataset.managerPrompt));
});
setupRichDescriptionEditor();
setupMarkdownEditors();
loadSettings()
  .catch(() => updateCriteriaText())
  .then(loadProjects);
projectAuthReady.then(() => {
  if (selectedProjectId) loadProjects();
});
setInterval(loadProjects, 60000);
