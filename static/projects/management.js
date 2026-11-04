/* Card management and collaboration. All writes use the existing project API. */
let editorChecklist = [];
let evidenceDraft = [];
let commentReplyTo = null;
let collaborationBusy = false;
const managementPriorities = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };
const managementFields = { title: "Título", status: "Etapa", description: "Descrição", parentId: "Vínculo", assignee: "Responsável", priority: "Prioridade", dueDate: "Prazo", nextAction: "Próxima ação", blocked: "Bloqueio manual", blockedReason: "Motivo do bloqueio", acceptanceCriteria: "Critérios de conclusão", checklist: "Checklist", archived: "Arquivamento" };
function managementIdentity() {
  return authState.user?.id || "";
}

function renderTeamQueues(container, project, state) {
  const items = (project.workItems || []).filter(item => !item.archived);
  const stages = new Map(kanbanColumnOrder(project).map(id => [id,
    (project.workItemColumns || []).find(column => column.id === id)?.title
      || kanbanBuiltInColumns.find(column => column.id === id)?.title || id]));
  for (const item of items) stages.set(workItemStage(item), workItemStatusLabel(project, item));
  const people = authState.users.filter(user => user.active && (!state.teamRole || (user.workRole || "undefined") === state.teamRole));
  const columns = [...stages].filter(([id]) => !state.teamStage || id === state.teamStage);
  container.className = "team-queues";
  container.innerHTML = `<p class="hint">Atividades não arquivadas deste projeto, por responsável e fila. Zero indica que não há atividade atribuída nessa fila.</p>
    <div class="team-queue-filters"><label>Papel de trabalho<select data-team-role><option value="">Todos os papéis</option>${Object.entries(workRoles).map(([id, label]) => `<option value="${id || 'undefined'}" ${(state.teamRole || '') === (id || 'undefined') ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
    <label>Fila<select data-team-stage><option value="">Todas as filas</option>${[...stages].map(([id,label]) => `<option value="${escapeHtml(id)}" ${state.teamStage === id ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label></div>
    <div class="team-queue-table"><table><thead><tr><th scope="col">Pessoa</th><th scope="col">Papel</th>${columns.map(([,label]) => `<th scope="col">${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${people.map(user => `<tr><th scope="row">${escapeHtml(user.name)}</th><td>${escapeHtml(workRoles[user.workRole] || workRoles[''])}</td>${columns.map(([stage,label]) => {
      const count = items.filter(item => item.assigneeId === user.id && workItemStage(item) === stage).length;
      return `<td>${count ? `<button type="button" data-team-person="${escapeHtml(user.id)}" data-team-queue="${escapeHtml(stage)}" aria-label="${escapeHtml(user.name)}: ${count} atividades em ${escapeHtml(label)}">${count}</button>` : '0'}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
    ${people.length ? '' : '<p class="hint">Nenhuma pessoa neste papel. Um administrador pode definir os papéis em Pessoas e acesso.</p>'}
    <p class="hint">${items.filter(item => !item.assigneeId).length} atividade(s) sem responsável cadastrado.</p><div data-team-items></div>`;
  container.querySelector('[data-team-role]').addEventListener('change', event => { state.teamRole = event.target.value; renderTeamQueues(container, project, state); });
  container.querySelector('[data-team-stage]').addEventListener('change', event => { state.teamStage = event.target.value; renderTeamQueues(container, project, state); });
  container.querySelectorAll('[data-team-person]').forEach(button => button.addEventListener('click', () => {
    const selected = items.filter(item => item.assigneeId === button.dataset.teamPerson && workItemStage(item) === button.dataset.teamQueue);
    const details = container.querySelector('[data-team-items]');
    details.replaceChildren();
    for (const item of selected) {
      const open = document.createElement('button');
      open.type = 'button'; open.textContent = item.title;
      open.addEventListener('click', () => openWorkItemEditor(project, item));
      details.appendChild(open);
    }
  }));
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
  if (filter === "blocked") return !done && Boolean(item.blocked || item.pendingBugs?.length);
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

function canConfirmBug() {
  return Boolean(authState.user && (authState.user.role === 'admin' || authState.user.workRole === 'tester'));
}

function bugWorkflowActionsHtml(item, editor = false) {
  if (item.type !== 'bug' || item.archived || !authState.user) return '';
  const attribute = editor ? 'data-bug-editor-state' : 'data-bug-state';
  const actions = [];
  if (item.status !== 'closed' && canConfirmBug()) actions.push(`<button type="button" ${attribute}="closed">Confirmar correção</button>`);
  else if (!['ready-for-retest', 'closed'].includes(item.status)) actions.push(`<button type="button" ${attribute}="ready-for-retest">Enviar para teste</button>`);
  if (['ready-for-retest', 'closed'].includes(item.status)) actions.push(`<button type="button" class="secondary-action" ${attribute}="fixing">${item.status === 'closed' ? 'Reabrir para correção' : 'Devolver para correção'}</button>`);
  return actions.length ? `<div class="bug-workflow-actions">${actions.join('')}</div>` : '';
}

function renderBugWorkflowGuide(project) {
  const root = document.querySelector('#bugWorkflowGuide');
  if (!root || workItemType.value !== 'bug') return;
  const item = (project.workItems || []).find(candidate => candidate.id === editingWorkItemId);
  const status = workItemStatus.value;
  const stages = [['open', 'Aberto'], ['fixing', 'Em correção'], ['ready-for-retest', 'Pronto para teste'], ['closed', 'Corrigido']];
  const parent = (project.workItems || []).find(candidate => candidate.id === (workItemParent.value || item?.parentId));
  root.innerHTML = `<ol class="bug-workflow-steps" aria-label="Situação do bug">${stages.map(([value, label]) => `<li ${status === value ? 'aria-current="step"' : ''}>${label}</li>`).join('')}</ol>
    ${parent ? `<button type="button" class="secondary-action bug-parent-link" data-open-bug-parent>Ver artefato: ${escapeHtml(parent.title)}</button>` : '<p class="hint">Vincule este bug ao artefato técnico afetado.</p>'}
    ${bugWorkflowActionsHtml({type: 'bug', status, archived: item?.archived}, true)}`;
  root.querySelectorAll('[data-bug-editor-state]').forEach(button => button.addEventListener('click', () => {
    workItemStatus.value = button.dataset.bugEditorState;
    renderBugWorkflowGuide(project);
    workItemForm.requestSubmit();
  }));
  root.querySelector('[data-open-bug-parent]')?.addEventListener('click', () => {
    if (editorHasUnsavedChanges() && !confirm('Descartar alterações não salvas para abrir o artefato vinculado?')) return;
    openWorkItemEditor(project, parent);
  });
}

for (const selector of ['#workItemStatus', '#workItemParent']) {
  document.querySelector(selector).addEventListener('change', () => {
    const project = projectsCache.find(candidate => candidate.id === workItemProjectId);
    if (project) renderBugWorkflowGuide(project);
  });
}

function workItemManagementHtml(item) {
  const checklist = item.checklist || [];
  return `<div class="card-management-meta">
    <span>${escapeHtml(item.assignee || "Sem responsável")}</span>
    ${item.type === 'bug' ? `<span class="bug-lifecycle-badge state-${escapeHtml(item.status)}">${escapeHtml(workItemStatuses.bug[item.status] || 'Aberto')}</span>` : ''}
    <span class="priority-${escapeHtml(item.priority || "normal")}">${managementPriorities[item.priority] || "Normal"}</span>
    ${item.dueDate ? `<span class="${workItemMatchesAttention(item, "overdue") ? "overdue-label" : ""}">Prazo: ${escapeHtml(formatDate(`${item.dueDate}T12:00:00`))}</span>` : ""}
    ${checklist.length ? `<span>Etapas: ${checklist.filter((entry) => entry.done).length}/${checklist.length}</span>` : ""}
    ${item.comments?.length ? `<span>${item.comments.length} mensagens</span>` : ""}
    ${item.evidence?.length ? `<span>${item.evidence.length} evidências</span>` : ""}
    ${item.nextAction ? `<small>Próxima ação: ${escapeHtml(item.nextAction)}</small>` : ""}
    ${item.pendingBugs?.length ? `<span class="blocking-badge">Homologação bloqueada · ${item.pendingBugs.length} bug${item.pendingBugs.length > 1 ? 's' : ''} pendente${item.pendingBugs.length > 1 ? 's' : ''}</span>` : ''}
    ${item.pendingBugs?.length ? '<button type="button" class="secondary-action" data-action="review-pending-bugs">Revisar bugs vinculados</button>' : ''}
    ${item.blocked ? `<span class="blocking-badge">Bloqueada por outro motivo</span>${item.blockedReason ? `<small>Bloqueio: ${escapeHtml(item.blockedReason)}</small>` : ''}` : ''}
    ${bugWorkflowActionsHtml(item)}
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
  pending.innerHTML = item?.pendingBugs?.length ? `<strong>Homologação aguardando validação dos bugs</strong><p>Confirme a correção de cada bug antes de homologar ou concluir. Abrir ou reabrir um bug devolve a atividade para teste. Clique em um bug para revisar.</p>${item.pendingBugs.map(bug => `<button type="button" data-open-pending-bug="${escapeHtml(bug.id)}">${escapeHtml(bug.title)} · ${escapeHtml(workItemStatuses.bug[bug.status] || 'Aberto')}</button>`).join('')}` : '';
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
    return `<article class="card-comment ${comment.authorId === authState.user?.id ? "own-comment" : ""}" data-comment-id="${escapeHtml(comment.id)}"><header><strong>${escapeHtml(comment.author)}</strong><small>${escapeHtml(comment.authorEmail || "")} · ${escapeHtml(formatDate(comment.createdAt, true))}</small></header>${parent ? `<blockquote>Em resposta a ${escapeHtml(parent.author)}: ${escapeHtml(parent.text.slice(0, 180))}</blockquote>` : ""}<p>${escapeHtml(comment.text)}</p>${comment.mentions?.length ? `<p class="hint">Notificados: ${comment.mentions.map((user) => escapeHtml(user.name)).join(", ")}</p>` : ""}<button type="button" data-reply>Responder</button> <button type="button" data-convert>Transformar em atividade</button></article>`;
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
  const mentionIds = getCommentMentionIds();
  await requireCollaborationResponse(await fetch(`${appBasePath}/api/projects/${workItemProjectId}/work-items/${editingWorkItemId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mentionIds, replyTo: commentReplyTo }) }));
  commentReplyTo = null;
  document.querySelector("#commentText").value = "";
  resetCommentMentions();
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
