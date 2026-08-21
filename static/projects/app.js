const projectsEl = document.querySelector("#projects");
const detailTemplate = document.querySelector("#projectTemplate");
const form = document.querySelector("#projectForm");
const refreshButton = document.querySelector("#refreshButton");
const lastUpdate = document.querySelector("#lastUpdate");
const dashboardTitle = document.querySelector("#dashboard-title");
const reportModal = document.querySelector("#reportModal");
const reportSubject = document.querySelector("#reportSubject");
const reportBody = document.querySelector("#reportBody");
const copyReportButton = document.querySelector("#copyReportButton");
const closeReportButton = document.querySelector("#closeReportButton");
const mailtoReportLink = document.querySelector("#mailtoReportLink");
const projectUiState = new Map();
const appBasePath = document.documentElement.dataset.basePath || "";

let projectsCache = [];
let selectedProjectId = localStorage.getItem("selectedProjectId") || null;

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

function projectSource(project) {
  return project.uploadedSchedule?.name || project.sharepointUrl || project.folderPath || "";
}

function projectRiskClass(dashboard, variance) {
  if ((dashboard.lateTasks ?? 0) > 0) return "late";
  if ((dashboard.attentionTasks ?? 0) > 0 || variance < 0) return "risk";
  return "ok";
}

function projectRiskLabel(dashboard, variance) {
  if ((dashboard.lateTasks ?? 0) > 0) return "Atrasado";
  if ((dashboard.attentionTasks ?? 0) > 0 || variance < 0) return "Atenção";
  return "Em dia";
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
  const subject = `Status do projeto - ${project.name} - ${status}`;
  const lines = [
    "Olá,",
    "",
    `Segue status atualizado do projeto ${project.name}.`,
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
  mailtoReportLink.href = `mailto:?subject=${encodeURIComponent(report.subject)}&body=${encodeURIComponent(report.body)}`;
  reportModal.hidden = false;
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
  dashboardTitle.textContent = "Dashboard";
  projectsEl.className = "dashboard-grid";
  projectsEl.innerHTML = "";

  if (!projects.length) {
    projectsEl.innerHTML = "<p class=\"hint\">Nenhum projeto cadastrado.</p>";
    return;
  }

  for (const project of projects) {
    const { dashboard, realized, planned, variance, selectedFile } = getDashboardNumbers(project);
    const card = document.createElement("article");
    const riskClass = projectRiskClass(dashboard, variance);
    card.className = `summary-card ${riskClass}`;
    card.innerHTML = `
      <div class="summary-head">
        <div>
          <h3>${escapeHtml(project.name)}</h3>
          <p>${escapeHtml(selectedFile?.name || "Nenhum cronograma localizado")}</p>
        </div>
        <span class="summary-status ${riskClass}">${dashboard.status === "parsed" ? projectRiskLabel(dashboard, variance) : "Falha"}</span>
      </div>
      <div class="summary-kpis">
        <div><span>Planejado</span><strong>${planned}%</strong></div>
        <div><span>Realizado</span><strong>${realized}%</strong></div>
        <div><span>Desvio</span><strong>${variance > 0 ? "+" : ""}${variance} p.p.</strong></div>
      </div>
      <div class="summary-counts">
        <span>${dashboard.attentionTasks ?? "-"} atenção</span>
        <span>${dashboard.lateTasks ?? "-"} atrasadas</span>
        <span>${dashboard.inProgressTasks ?? "-"} em andamento</span>
      </div>
      <div class="summary-progress">
        <span style="width:${Math.max(0, Math.min(100, realized))}%"></span>
      </div>
      <button type="button" data-action="open">Abrir projeto</button>
    `;
    card.querySelector("[data-action='open']").addEventListener("click", () => openProject(project.id));
    projectsEl.appendChild(card);
  }
}

function renderProjectDetail(project) {
  dashboardTitle.textContent = project.name;
  projectsEl.className = "project-grid";
  projectsEl.innerHTML = "";

  const node = detailTemplate.content.cloneNode(true);
  const { dashboard, realized, planned, variance, selectedFile } = getDashboardNumbers(project);

  if (!projectUiState.has(project.id)) {
    projectUiState.set(project.id, { filter: "all", collapsed: new Set() });
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
  node.querySelector("[data-action='report']").addEventListener("click", () => openStatusReport(project));

  const taskContainer = node.querySelector("[data-field='tasks']");
  const filtersContainer = node.querySelector("[data-field='taskFilters']");
  const repaintTasks = () => {
    renderTaskFilters(filtersContainer, taskState, repaintTasks);
    renderTasks(taskContainer, dashboard.tasks, taskState);
  };
  repaintTasks();

  projectsEl.appendChild(node);
}

function renderCurrentView() {
  const selectedProject = projectsCache.find((project) => project.id === selectedProjectId);
  if (selectedProject) {
    renderProjectDetail(selectedProject);
    return;
  }
  selectedProjectId = null;
  localStorage.removeItem("selectedProjectId");
  renderDashboard(projectsCache);
}

function openProject(id) {
  selectedProjectId = id;
  localStorage.setItem("selectedProjectId", id);
  renderCurrentView();
}

function showDashboard() {
  selectedProjectId = null;
  localStorage.removeItem("selectedProjectId");
  renderCurrentView();
}

async function loadProjects() {
  refreshButton.disabled = true;
  try {
    const response = await fetch(`${appBasePath}/api/projects`);
    const projects = await response.json();
    if (!response.ok) throw new Error(projects.error || "Falha ao carregar projetos.");
    projectsCache = projects;
    renderCurrentView();
    lastUpdate.textContent = `Última verificação: ${formatDate(new Date().toISOString(), true)}`;
  } catch (error) {
    projectsEl.innerHTML = `<p class="hint">${error.message}</p>`;
  } finally {
    refreshButton.disabled = false;
  }
}

async function deleteProject(id) {
  await fetch(`${appBasePath}/api/projects/${id}`, { method: "DELETE" });
  if (selectedProjectId === id) {
    selectedProjectId = null;
    localStorage.removeItem("selectedProjectId");
  }
  projectUiState.delete(id);
  await loadProjects();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#projectName").value.trim();
  const source = document.querySelector("#folderPath").value.trim();
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
    response = await fetch(`${appBasePath}/api/projects/upload`, {
      method: "POST",
      body: formData,
    });
  } else {
    const payload = { name };
    if (!source) {
      alert("Informe uma pasta, URL do SharePoint ou envie um arquivo.");
      return;
    }
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
    alert(body.error || "Nao foi possivel cadastrar o projeto.");
    return;
  }

  form.reset();
  selectedProjectId = body.id;
  localStorage.setItem("selectedProjectId", body.id);
  await loadProjects();
});

refreshButton.addEventListener("click", loadProjects);
closeReportButton.addEventListener("click", () => {
  reportModal.hidden = true;
});
copyReportButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(`${reportSubject.value}\n\n${reportBody.value}`);
  copyReportButton.textContent = "Copiado";
  setTimeout(() => {
    copyReportButton.textContent = "Copiar e-mail";
  }, 1600);
});
loadProjects();
setInterval(loadProjects, 60000);
