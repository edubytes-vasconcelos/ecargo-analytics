/* Accessible interactions shared by the project workspace. */
let editorDirty = false;
let modalReturnFocus = null;
let previousModal = null;
let lastWorkspaceTrigger = null;

function editorHasUnsavedChanges() {
  return editorDirty || Boolean(document.querySelector('#commentText').value.trim()) || evidenceDraft.length > 0;
}
function markEditorSaved() {
  editorDirty = false;
  document.querySelector('#editorSaveState').textContent = 'Alterações salvas';
}
function resetEditorWorkspace(project, item) {
  markEditorSaved();
  document.querySelector('#editorProjectName').textContent = project.name;
  document.querySelector('#workItemModalTitle').textContent = item ? item.title : 'Nova atividade';
  updateEditorCounts(item);
  populateWorkspaceMentions();
  updateBlockedReasonVisibility();
  if (!item) document.querySelector("#editorSaveState").textContent = "Preencha os dados para criar a atividade";
  selectEditorTab('details');
  document.querySelector('#workItemTitle').focus();
}
function updateEditorCounts(item) {
  document.querySelector('[data-editor-count="comments"]').textContent = item?.comments?.length || 0;
  document.querySelector('[data-editor-count="evidence"]').textContent = item?.evidence?.length || 0;
  window.syncWorkspaceMentions?.();
  document.querySelectorAll('[data-editor-tab]').forEach(button => {
    button.disabled = button.dataset.editorTab !== 'details' && !item;
    if (button.disabled) button.title = 'Salve a atividade para acessar esta seção';
    else button.removeAttribute('title');
  });
}
function selectEditorTab(name, focus = false) {
  const button = document.querySelector(`[data-editor-tab="${name}"]`);
  if (!button || button.disabled) return;
  if (document.querySelector('[data-editor-tab][aria-selected=true]') !== button && !collaborationBusy) document.querySelector('#collaborationStatus').textContent = '';
  const ids = { details: 'workItemForm', conversation: 'editorConversation', evidence: 'editorEvidence', history: 'editorHistory' };
  for (const [key, id] of Object.entries(ids)) document.getElementById(id).hidden = key !== name;
  document.querySelectorAll('[data-editor-tab]').forEach(tab => {
    const selected = tab === button;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelector('.editor-body').scrollTop = 0;
  if (focus) button.focus();
}
document.querySelectorAll('[data-editor-tab]').forEach(button => {
  button.addEventListener('click', () => selectEditorTab(button.dataset.editorTab));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[data-editor-tab]')].filter(tab => !tab.disabled);
    const index = tabs.indexOf(button);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectEditorTab(tabs[next].dataset.editorTab, true);
  });
});
for (const event of ['input','change']) document.querySelector('#workItemForm').addEventListener(event, () => {
  editorDirty = true;
  document.querySelector('#editorSaveState').textContent = 'Alterações não salvas';
});
document.querySelector('#workItemChecklist').addEventListener('click', event => {
  if (event.target.closest('[data-remove-check]')) { editorDirty = true; document.querySelector('#editorSaveState').textContent = 'Alterações não salvas'; }
});

function openWorkspaceModals() { return [...document.querySelectorAll('.modal')].filter(modal => !modal.hidden); }
function focusableWorkspaceElements(modal) {
  return [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]')].filter(element => !element.closest('[hidden]') && element.getClientRects().length);
}
function syncWorkspaceModal() {
  const modals = openWorkspaceModals();
  const current = modals.at(-1);
  document.body.classList.toggle('has-open-modal', Boolean(current));
  document.querySelectorAll('body > header, body > main').forEach(element => { element.inert = Boolean(current); });
  if (current && previousModal !== current) {
    if (!previousModal) modalReturnFocus = lastWorkspaceTrigger || document.activeElement;
    if (!current.contains(document.activeElement)) focusableWorkspaceElements(current)[0]?.focus();
  } else if (!current && previousModal) {
    if (modalReturnFocus?.isConnected && !modalReturnFocus.closest('[hidden]')) modalReturnFocus.focus();
    modalReturnFocus = null;
  }
  previousModal = current;
}
new MutationObserver(syncWorkspaceModal).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
document.addEventListener('pointerdown', event => { if (!event.target.closest('.modal')) lastWorkspaceTrigger = event.target.closest('button,a,summary') || document.activeElement; });
document.addEventListener('keydown', event => {
  const current = openWorkspaceModals().at(-1);
  if (!current) return;
  if (event.key === 'Tab') {
    const focusables = focusableWorkspaceElements(current);
    if (!focusables.length) { event.preventDefault(); return; }
    const index = focusables.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); focusables.at(-1).focus(); }
    else if (!event.shiftKey && (index === focusables.length - 1 || index === -1)) { event.preventDefault(); focusables[0].focus(); }
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (current.id === 'workItemModal') closeWorkItemEditor();
    else if (current.id === 'localAuthModal' && authState.user?.mustChangePassword) return;
    else current.querySelector('[id^="close"]')?.click();
  }
});
document.addEventListener('focusin', event => {
  const current = openWorkspaceModals().at(-1);
  if (current && !current.contains(event.target)) focusableWorkspaceElements(current)[0]?.focus();
});
document.addEventListener('click', event => {
  document.querySelectorAll('.account-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
  const toggle = event.target.closest('[data-password-target]');
  if (toggle) {
    const input = document.getElementById(toggle.dataset.passwordTarget);
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    toggle.textContent = reveal ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-pressed', String(reveal));
  }
});

function decorateWorkItemToolbar(root, project, state) {
  root.querySelectorAll('[data-filter],[data-view],[data-attention]').forEach(button => button.setAttribute('aria-pressed',String(button.classList.contains('active'))));
  root.querySelector('.activity-search-tools')?.remove();
  const tools = document.createElement('div');
  tools.className = 'activity-search-tools';
  const label = document.createElement('label');
  label.className = 'activity-search';
  const caption = document.createElement('span'); caption.textContent = 'Buscar atividades';
  const input = document.createElement('input'); input.type = 'search'; input.placeholder = 'Buscar por título ou descrição'; input.value = state.workItemQuery || ''; input.dataset.field = 'activitySearchInput';
  label.append(caption, input);
  const ownerLabel = document.createElement('label');
  const ownerCaption = document.createElement('span'); ownerCaption.textContent = 'Responsável';
  const owner = document.createElement('select'); owner.setAttribute('aria-label','Filtrar por responsável'); owner.add(new Option('Todos os responsáveis',''));
  const names = [...new Set((project.workItems || []).filter(item => !item.archived && item.assignee).map(item => item.assignee))].sort((a,b) => a.localeCompare(b,'pt-BR'));
  for (const name of names) owner.add(new Option(name,name));
  owner.value = state.workItemOwner || '';
  ownerLabel.append(ownerCaption,owner);
  const results = document.createElement('span'); results.className = 'activity-result-count'; results.dataset.field = 'activityResultCount'; results.setAttribute('role','status');
  tools.append(label, ownerLabel, results);
  root.querySelector('[data-field="workItemFilters"]').after(tools);
  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => {
    state.workItemQuery = input.value;
    renderProjectDetail(project);
    const replacement = document.querySelector('[data-field="activitySearchInput"]');
    replacement?.focus();
  },200); });
  owner.addEventListener('change', () => { state.workItemOwner = owner.value; renderProjectDetail(project); });
}
function normalizedActivityText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR'); }
function matchesWorkspaceSearch(item,state) {
  return (!state.workItemOwner || item.assignee === state.workItemOwner) && (!state.workItemQuery || normalizedActivityText(`${item.title} ${item.description || ''} ${item.nextAction || ''}`).includes(normalizedActivityText(state.workItemQuery)));
}

syncWorkspaceModal();
if (projectsCache.length && workItemModal.hidden) renderCurrentView();

function populateWorkspaceMentions() {
  const list = document.querySelector('#mentionOptions');
  list.replaceChildren();
  for (const option of document.querySelector('#commentMentions').options) {
    const label = document.createElement('label');
    const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.mentionUserId = option.value; input.checked = option.selected;
    const text = document.createElement('span'); text.textContent = option.textContent;
    input.addEventListener('change', () => { option.selected = input.checked; syncWorkspaceMentions(); });
    label.append(input,text); list.appendChild(label);
  }
  document.querySelector('.mentions-picker').open = false;
  syncWorkspaceMentions();
}
function syncWorkspaceMentions() {
  const selected = new Set([...document.querySelector('#commentMentions').selectedOptions].map(option => option.value));
  document.querySelectorAll('[data-mention-user-id]').forEach(input => { input.checked = selected.has(input.dataset.mentionUserId); });
  document.querySelector('#mentionSelectionCount').textContent = selected.size ? `${selected.size} selecionada${selected.size === 1 ? '' : 's'}` : 'Opcional';
}
document.querySelector('#jumpToComposer').addEventListener('click', () => { document.querySelector('#commentText').focus(); document.querySelector('.comment-composer').scrollIntoView({ block: 'nearest' }); });
function updateBlockedReasonVisibility() {
  const reason = document.querySelector('#workItemBlockedReason');
  reason.closest('label').hidden = !document.querySelector('#workItemBlocked').checked;
}
document.querySelector('#workItemBlocked').addEventListener('change', updateBlockedReasonVisibility);
