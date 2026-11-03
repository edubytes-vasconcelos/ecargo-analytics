/* Card management and collaboration. All writes use the existing project API. */
let editorChecklist = [];
let evidenceDraft = [];
let commentReplyTo = null;
let collaborationBusy = false;
const managementPriorities = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };
const managementFields = { title: "Título", status: "Etapa", description: "Descrição", parentId: "Vínculo", assignee: "Responsável", priority: "Prioridade", dueDate: "Prazo", nextAction: "Próxima ação", blocked: "Bloqueio manual", blockedReason: "Motivo do bloqueio", acceptanceCriteria: "Critérios de conclusão", checklist: "Checklist", archived: "Arquivamento" };
let dashboardAttentionFilter = "overdue";

function renderManagementOverview(projects) {
  const section = document.createElement("section");
  section.className = "dashboard-section management-overview";
  const entries = projects.flatMap((project) => (project.workItems || []).filter((item) => !item.archived).map((item) => ({ project, item })));
  const filters = [["overdue", "Atrasadas"], ["blocked", "Bloqueadas"], ["unassigned", "Sem responsável"], ["soon", "Vencem em 7 dias"]];
  section.innerHTML = `<h2>Atenção às atividades</h2><div class="work-item-summary" data-field="managementOverview">${filters.map(([filter, title]) => `<button type="button" class="attention-metric ${filter === dashboardAttentionFilter ? "active" : ""}" data-overview-filter="${filter}"><strong>${entries.filter(({ item }) => workItemMatchesAttention(item, filter)).length}</strong><span>${title}</span></button>`).join("")}</div><div class="management-attention-list">${entries.filter(({ item }) => workItemMatchesAttention(item, dashboardAttentionFilter)).map(({ project, item }) => `<button type="button" class="management-attention-item" data-open-project="${escapeHtml(project.id)}" data-open-item="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(project.name)} · ${escapeHtml(item.assignee || "Sem responsável")}${item.dueDate ? ` · ${escapeHtml(formatDate(`${item.dueDate}T12:00:00`))}` : ""}</span></button>`).join("") || '<p class="hint">Nenhuma atividade neste filtro.</p>'}</div>`;
  section.querySelectorAll("[data-overview-filter]").forEach((button) => button.addEventListener("click", () => { dashboardAttentionFilter = button.dataset.overviewFilter; renderDashboard(projects); }));
  section.querySelectorAll("[data-open-item]").forEach((button) => button.addEventListener("click", () => {
    const project = projects.find((entry) => entry.id === button.dataset.openProject);
    openProject(project.id);
    openWorkItemEditor(project, project.workItems.find((item) => item.id === button.dataset.openItem));
  }));
  return section;
}

function managementIdentity() {
  return authState.user?.id || "";
}

function populateCardAssignees(item) {
  const select = document.querySelector("#workItemAssignee");
  select.replaceChildren(new Option("Sem responsável", ""));
  for (const user of authState.users.filter(user => user.active)) select.add(new Option(`${user.name} (${user.email})`, user.id));
  if (item?.assignee && !authState.users.some(user => user.active && user.id === item.assigneeId)) select.add(new Option(`${item.assignee} (cadastro anterior)`, item.assigneeId || item.assignee));
  select.value = item?.assigneeId || item?.assignee || "";
}

function managementToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function workItemMatchesAttention(item, filter) {
  const done = ["approved", "done", "closed"].includes(item.status);
  const identity = managementIdentity().toLocaleLowerCase("pt-BR");
  const today = managementToday();
  if (filter === "overdue") return !done && Boolean(item.dueDate) && item.dueDate < today;
  if (filter === "blocked") return Boolean(item.blocked || item.pendingBugs?.length);
  if (filter === "unassigned") return !done && !item.assignee?.trim();
  if (filter === "mine") return !done && Boolean(identity) && item.assigneeId?.toLocaleLowerCase("pt-BR") === identity;
  if (filter === "mentions") return Boolean(identity) && (item.comments || []).some((comment) => (comment.mentionIds || []).includes(identity));
  if (filter === "soon") {
    const limit = new Date(`${today}T12:00:00`);
    limit.setDate(limit.getDate() + 7);
    return !done && Boolean(item.dueDate) && item.dueDate >= today && new Date(`${item.dueDate}T12:00:00`) <= limit;
  }
  return true;
}

function workItemManagementHtml(item) {
  const checklist = item.checklist || [];
  return `<div class="card-management-meta">
    <span>${escapeHtml(item.assignee || "Sem responsável")}</span>
    <span class="priority-${escapeHtml(item.priority || "normal")}">${managementPriorities[item.priority] || "Normal"}</span>
    ${item.dueDate ? `<span class="${workItemMatchesAttention(item, "overdue") ? "overdue-label" : ""}">Prazo: ${escapeHtml(formatDate(`${item.dueDate}T12:00:00`))}</span>` : ""}
    ${checklist.length ? `<span>Etapas: ${checklist.filter((entry) => entry.done).length}/${checklist.length}</span>` : ""}
    ${item.comments?.length ? `<span>${item.comments.length} mensagens</span>` : ""}
    ${item.evidence?.length ? `<span>${item.evidence.length} evidências</span>` : ""}
    ${item.nextAction ? `<small>Próxima ação: ${escapeHtml(item.nextAction)}</small>` : ""}
    ${item.pendingBugs?.length ? `<span class="blocking-badge">Bloqueada · ${item.pendingBugs.length} bug${item.pendingBugs.length > 1 ? 's' : ''} pendente${item.pendingBugs.length > 1 ? 's' : ''}</span>` : ''}
    ${item.blocked ? `<span class="blocking-badge">Bloqueada por outro motivo</span>${item.blockedReason ? `<small>Bloqueio: ${escapeHtml(item.blockedReason)}</small>` : ''}` : ''}
  </div>`;
}

function renderEditorChecklist() {
  const root = document.querySelector("#workItemChecklist");
  root.innerHTML = editorChecklist.map((entry, index) => `<div class="checklist-row"><label><input type="checkbox" data-check="${index}" ${entry.done ? "checked" : ""} /> <span>${escapeHtml(entry.text)}</span></label><button type="button" data-remove-check="${index}" aria-label="Remover etapa ${index + 1}">Remover</button></div>`).join("");
  root.querySelectorAll("[data-check]").forEach((input) => input.addEventListener("change", () => { editorChecklist[Number(input.dataset.check)].done = input.checked; }));
  root.querySelectorAll("[data-remove-check]").forEach((button) => button.addEventListener("click", () => { editorChecklist.splice(Number(button.dataset.removeCheck), 1); renderEditorChecklist(); }));
}

document.querySelector("#addChecklistItem").addEventListener("click", () => {
  const input = document.querySelector("#checklistText");
  if (!input.value.trim()) return;
  if (editorChecklist.length >= 100) { alert("Máximo de 100 etapas por card."); return; }
  editorChecklist.push({ text: input.value.trim(), done: false });
  input.value = "";
  renderEditorChecklist();
});
document.querySelector("#checklistText").addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); document.querySelector("#addChecklistItem").click(); }
});

function collaborationItem() {
  return projectsCache.find((project) => project.id === workItemProjectId)?.workItems?.find((item) => item.id === editingWorkItemId);
}

function renderCollaboration(item) {
  const pending = document.querySelector('#workItemPendingBugs');
  pending.hidden = !item?.pendingBugs?.length;
  pending.innerHTML = item?.pendingBugs?.length ? `<strong>Bloqueada por bugs pendentes</strong><p>A atividade permanece na etapa atual. O aviso desaparece quando todos os bugs forem fechados ou arquivados.</p>${item.pendingBugs.map(bug => `<button type="button" data-open-pending-bug="${escapeHtml(bug.id)}">${escapeHtml(bug.title)}</button>`).join('')}` : '';
  pending.querySelectorAll('[data-open-pending-bug]').forEach(button => button.addEventListener('click', () => {
    const project = projectsCache.find(project => project.id === workItemProjectId);
    const bug = project?.workItems.find(candidate => candidate.id === button.dataset.openPendingBug);
    if (bug && (!editorHasUnsavedChanges() || confirm('Descartar alterações não salvas para abrir o bug?'))) openWorkItemEditor(project, bug);
  }));
  document.querySelector("#collaborationStatus").textContent = "";
  document.querySelector("#commentReplyLabel").textContent = commentReplyTo ? "Respondendo à mensagem selecionada" : "";
  document.querySelector("#cancelReply").hidden = !commentReplyTo;
  document.querySelector("#evidenceList").innerHTML = (item?.evidence || []).map((entry) => `<div class="evidence-entry"><a href="${escapeHtml(entry.url)}" download="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</a><small>${Math.ceil(entry.size / 1024)} KB · ${escapeHtml(formatDate(entry.createdAt, true))}${entry.author ? ` · ${escapeHtml(entry.author)}` : ""}</small></div>`).join("") || '<p class="hint empty-evidence">Os arquivos enviados ficarão disponíveis aqui para toda a equipe.</p>';
  updateEditorCounts(item);
  const comments = item?.comments || [];
  document.querySelector("#commentList").innerHTML = comments.map((comment) => {
    const parent = comments.find((entry) => entry.id === comment.replyTo);
    return `<article class="card-comment ${comment.authorId === authState.user?.id ? "own-comment" : ""}" data-comment-id="${escapeHtml(comment.id)}"><header><strong>${escapeHtml(comment.author)}</strong><small>${escapeHtml(comment.authorEmail || "")} · ${escapeHtml(formatDate(comment.createdAt, true))}</small></header>${parent ? `<blockquote>Em resposta a ${escapeHtml(parent.author)}: ${escapeHtml(parent.text.slice(0, 180))}</blockquote>` : ""}<p>${escapeHtml(comment.text)}</p>${comment.mentions?.length ? `<p class="hint">${comment.mentions.map((user) => `@${escapeHtml(user.name)}`).join(" ")}</p>` : ""}<button type="button" data-reply>Responder</button> <button type="button" data-convert>Transformar em atividade</button></article>`;
  }).join("") || '<div class="conversation-empty"><span aria-hidden="true">◌</span><strong>A conversa começa aqui</strong><p>Registre decisões, tire dúvidas e mantenha a equipe no mesmo contexto.</p></div>';
  document.querySelectorAll("[data-reply]").forEach((button) => button.addEventListener("click", () => {
    commentReplyTo = button.closest("[data-comment-id]").dataset.commentId;
    document.querySelector("#commentReplyLabel").textContent = "Respondendo à mensagem selecionada";
    document.querySelector("#cancelReply").hidden = false;
    document.querySelector("#commentText").focus();
  }));
  document.querySelectorAll("[data-convert]").forEach((button) => button.addEventListener("click", async () => {
    const comment = comments.find((entry) => entry.id === button.closest("[data-comment-id]").dataset.commentId);
    const title = window.prompt("Título da nova atividade", comment.text.slice(0, 100));
    if (!title?.trim()) return;
    await runCollaborationAction(async () => {
      const type = item.type === "requirement" ? "technical-definition" : "bug";
      const parentId = item.type === "bug" ? item.parentId : item.id;
      const response = await fetch(`${appBasePath}/api/projects/${workItemProjectId}/work-items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, parentId, status: type === "bug" ? "open" : "backlog", title: title.trim(), description: `Origem: ${item.title}\nMensagem de ${comment.author}:\n${comment.text}` }) });
      await requireCollaborationResponse(response);
      await loadProjects();
      document.querySelector("#collaborationStatus").textContent = "Atividade criada e vinculada.";
    });
  }));
  document.querySelector("#workItemHistory").innerHTML = [...(item?.history || [])].filter((entry) => entry.field !== "assigneeId").reverse().map((entry) => `<div class="history-entry"><strong>${escapeHtml(managementFields[entry.field] || entry.field)}</strong><small>${escapeHtml(formatDate(entry.at, true))}${entry.author ? ` · ${escapeHtml(entry.author)}` : ""}</small><p>${escapeHtml(historyValue(entry.before, entry.field))} → ${escapeHtml(historyValue(entry.after, entry.field))}</p></div>`).join("") || '<div class="conversation-empty"><strong>Nenhuma alteração por enquanto</strong><p>As atualizações desta atividade aparecerão aqui com data e responsável.</p></div>';
}

function historyValue(value, field) {
  if (field === 'priority') return managementPriorities[value] || 'Normal';
  if (field === 'blocked') return value ? 'Sim' : 'Não';
  if (field === 'status') { const project = projectsCache.find(project => project.id === workItemProjectId); return project && value ? workItemStatusLabel(project, {type:collaborationItem()?.type || 'requirement',status:value}) : 'Não informado'; }
  if (field === 'parentId' && value) return projectsCache.find(project => project.id === workItemProjectId)?.workItems?.find(item => item.id === value)?.title || 'Atividade anterior';
  if (field === 'archived') return value ? 'Arquivada' : 'Ativa';
  if (value == null || value === "") return "Não informado";
  if (Array.isArray(value)) return value.map((entry) => `${entry.done ? "✓" : "○"} ${entry.text}`).join("; ");
  return String(value);
}

async function requireCollaborationResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Não foi possível concluir. Tente novamente.");
  return body;
}

async function runCollaborationAction(action) {
  if (collaborationBusy) return;
  collaborationBusy = true;
  const controls = [...document.querySelectorAll("#workItemModal button, #workItemCollaboration input, #workItemCollaboration textarea")];
  const wasDisabled = controls.map((control) => control.disabled);
  controls.forEach((control) => { control.disabled = true; });
  document.querySelector("#collaborationStatus").dataset.state = "pending";
  document.querySelector("#collaborationStatus").textContent = "Salvando…";
  try { await action(); document.querySelector("#collaborationStatus").dataset.state = "success"; }
  catch (error) { document.querySelector("#collaborationStatus").dataset.state = "error"; document.querySelector("#collaborationStatus").textContent = error.message; }
  finally { collaborationBusy = false; controls.forEach((control, index) => { control.disabled = wasDisabled[index]; }); }
}

document.querySelector("#sendComment").addEventListener("click", () => runCollaborationAction(async () => {
  const text = document.querySelector("#commentText").value.trim();
  if (!text) throw new Error("Informe a mensagem.");
  if (!authState.user) throw new Error("A identificação dos usuários precisa ser configurada para enviar mensagens.");
  const mentionIds = [...document.querySelector("#commentMentions").selectedOptions].map((option) => option.value);
  await requireCollaborationResponse(await fetch(`${appBasePath}/api/projects/${workItemProjectId}/work-items/${editingWorkItemId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mentionIds, replyTo: commentReplyTo }) }));
  document.querySelector("#commentMentions").selectedIndex = -1;
  commentReplyTo = null;
  document.querySelector("#commentText").value = "";
  await loadProjects();
  renderCollaboration(collaborationItem());
  document.querySelector("#collaborationStatus").textContent = "Mensagem enviada.";
}));
document.querySelector("#cancelReply").addEventListener("click", () => { commentReplyTo = null; renderCollaboration(collaborationItem()); });

function resetEvidenceDraft() {
  evidenceDraft.forEach((entry) => { if (entry.preview) URL.revokeObjectURL(entry.preview); });
  evidenceDraft = [];
  document.querySelector("#evidenceFiles").value = "";
  renderEvidenceDraft();
}

function addEvidenceFiles(files) {
  if (collaborationBusy) return;
  for (const file of files) {
    if (!file.size || file.size > 20 * 1024 * 1024) { document.querySelector("#collaborationStatus").textContent = `${file.name}: envie um arquivo não vazio de até 20 MB.`; continue; }
    if (evidenceDraft.some((entry) => entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified)) continue;
    const preview = /image\/(png|jpeg|webp|gif)$/.test(file.type) ? URL.createObjectURL(file) : null;
    evidenceDraft.push({ file, preview });
  }
  renderEvidenceDraft();
}

function renderEvidenceDraft() {
  document.querySelector("#evidencePending").innerHTML = evidenceDraft.map((entry, index) => `<div class="evidence-preview">${entry.preview ? `<img src="${entry.preview}" alt="Prévia de ${escapeHtml(entry.file.name)}" />` : ""}<span>${escapeHtml(entry.file.name)} · ${Math.ceil(entry.file.size / 1024)} KB</span><button type="button" data-remove-evidence="${index}">Remover</button></div>`).join("");
  document.querySelector("#sendEvidence").hidden = !evidenceDraft.length;
  document.querySelectorAll("[data-remove-evidence]").forEach((button) => button.addEventListener("click", () => {
    if (collaborationBusy) return;
    const [entry] = evidenceDraft.splice(Number(button.dataset.removeEvidence), 1);
    if (entry.preview) URL.revokeObjectURL(entry.preview);
    renderEvidenceDraft();
  }));
}

const evidenceDropZone = document.querySelector("#evidenceDropZone");
evidenceDropZone.addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.files || [])];
  if (!files.length) return;
  event.preventDefault();
  addEvidenceFiles(files);
});
evidenceDropZone.addEventListener("dragover", (event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); evidenceDropZone.classList.add("drag-over"); } });
evidenceDropZone.addEventListener("dragleave", () => evidenceDropZone.classList.remove("drag-over"));
evidenceDropZone.addEventListener("drop", (event) => { event.preventDefault(); evidenceDropZone.classList.remove("drag-over"); addEvidenceFiles(event.dataTransfer.files); });
document.querySelector("#evidenceFiles").addEventListener("change", (event) => { addEvidenceFiles(event.target.files); event.target.value = ""; });
document.querySelector("#sendEvidence").addEventListener("click", () => runCollaborationAction(async () => {
  while (evidenceDraft.length) {
    const entry = evidenceDraft[0];
    const data = new FormData();
    data.append("file", entry.file, entry.file.name);
    const uploaded = await requireCollaborationResponse(await fetch(`${appBasePath}/api/projects/${workItemProjectId}/work-items/${editingWorkItemId}/evidence`, { method: "POST", body: data }));
    const current = collaborationItem();
    if (current) (current.evidence ||= []).push(uploaded);
    evidenceDraft.shift();
    if (entry.preview) URL.revokeObjectURL(entry.preview);
    renderEvidenceDraft();
    renderCollaboration(collaborationItem());
  }
  await loadProjects();
  renderCollaboration(collaborationItem());
  document.querySelector("#collaborationStatus").textContent = "Evidências enviadas.";
}));
