const authState = { user: null, users: [], csrfToken: null, configured: true, setupRequired: false };
const projectNativeFetch = window.fetch.bind(window);
const projectAuthBase = document.documentElement.dataset.basePath || "";
const authModal = document.createElement("div");
authModal.id = "localAuthModal";
authModal.className = "modal";
authModal.hidden = true;
authModal.innerHTML = `<div class="modal-panel auth-panel" role="dialog" aria-modal="true" aria-labelledby="localAuthTitle"><div class="modal-header"><span class="auth-brand-mark" aria-hidden="true">E</span><button id="closeLocalAuth" type="button" aria-label="Fechar login">Fechar</button></div><div class="auth-intro"><h2 id="localAuthTitle">Entrar</h2><p id="localAuthIntro">Sua conta conecta você aos projetos e à sua equipe.</p></div><p id="localAuthStatus" role="status" aria-live="polite"></p><form id="localLoginForm" class="modal-form"><label>E-mail<input id="localLoginEmail" type="email" autocomplete="username" placeholder="voce@empresa.com" maxlength="254" required /></label><label>Senha<span class="password-control"><input id="localLoginPassword" type="password" autocomplete="current-password" maxlength="256" required /><button type="button" data-password-target="localLoginPassword" aria-pressed="false">Mostrar</button></span></label><button class="auth-submit" type="submit">Entrar</button><p class="auth-help">Precisa de acesso ou esqueceu a senha?<br />Fale com o administrador da sua equipe.</p></form><form id="localPasswordForm" class="modal-form" hidden><p class="hint">Use pelo menos 12 caracteres. Uma frase com palavras diferentes é uma boa opção.</p><label>Senha atual<span class="password-control"><input id="localCurrentPassword" type="password" autocomplete="current-password" required /><button type="button" data-password-target="localCurrentPassword" aria-pressed="false">Mostrar</button></span></label><label>Nova senha<span class="password-control"><input id="localNewPassword" type="password" autocomplete="new-password" minlength="12" maxlength="256" required /><button type="button" data-password-target="localNewPassword" aria-pressed="false">Mostrar</button></span></label><label>Confirme a nova senha<input id="localConfirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="256" required /></label><button type="submit">Salvar nova senha</button></form></div>`;
document.body.appendChild(authModal);
const usersModal = document.createElement("div");
usersModal.id = "localUsersModal";
usersModal.className = "modal";
usersModal.hidden = true;
usersModal.innerHTML = `<div class="modal-panel users-panel" role="dialog" aria-modal="true" aria-labelledby="localUsersTitle"><div class="modal-header"><div><h2 id="localUsersTitle">Pessoas e acesso</h2><p class="hint">Controle quem participa e o que cada pessoa pode fazer.</p></div><button id="closeLocalUsers" type="button">Fechar</button></div><div class="users-layout"><section class="user-create-panel"><h3>Adicionar pessoa</h3><form id="localUserForm" class="modal-form"><label>Nome<input id="localUserName" placeholder="Nome completo" maxlength="120" required /></label><label>E-mail<input id="localUserEmail" type="email" placeholder="pessoa@empresa.com" maxlength="254" required /></label><label>Perfil<select id="localUserRole" aria-describedby="userRoleHelp"><option value="collaborator">Colaborador</option><option value="admin">Administrador</option></select></label><p id="userRoleHelp" class="hint">Colaboradores trabalham nos projetos. Administradores também gerenciam pessoas e configurações.</p><button type="submit">Cadastrar usuário</button></form></section><section class="users-directory"><div class="users-directory-heading"><h3>Equipe <span id="localUserCount"></span></h3><label class="users-search"><span>Buscar pessoa</span><input id="localUserSearch" type="search" placeholder="Nome ou e-mail" /></label></div><div id="localUsersList"></div></section></div><p id="localUsersStatus" role="status" aria-live="polite"></p><div class="initial-password-block" hidden><output id="localInitialPassword" class="initial-password" hidden></output><button id="copyInitialPassword" type="button">Copiar senha inicial</button></div></div>`;
document.body.appendChild(usersModal);

async function loadProjectIdentity() {
  const response = await projectNativeFetch(`${projectAuthBase}/api/auth/session`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao consultar sessão");
  Object.assign(authState, await response.json());
  authState.users = [];
  if (authState.user && !authState.user.mustChangePassword) {
    const usersResponse = await projectNativeFetch(`${projectAuthBase}/api/auth/users`, { cache: "no-store" });
    if (usersResponse.ok) authState.users = await usersResponse.json();
  }
  renderProjectIdentity();
  document.dispatchEvent(new Event("project-identity-loaded"));
  if (authState.user?.mustChangePassword) openLocalAuth("password");
}

function openLocalAuth(mode = "login") {
  resetVisiblePasswords();
  document.querySelector("#localAuthStatus").textContent = authState.setupRequired ? "O primeiro administrador precisa ser cadastrado no servidor." : "";
  document.querySelector("#localAuthTitle").textContent = mode === "login" ? "Entrar" : authState.user?.mustChangePassword ? "Troque sua senha inicial" : "Trocar senha";
  document.querySelector("#localAuthIntro").textContent = mode === "login" ? "Sua conta conecta você aos projetos e à sua equipe." : authState.user?.mustChangePassword ? "Antes de continuar, escolha uma senha que só você conhece." : "Mantenha sua conta protegida com uma senha pessoal.";
  document.querySelector("#localLoginForm").hidden = mode !== "login";
  document.querySelector("#localPasswordForm").hidden = mode !== "password";
  document.querySelector("#closeLocalAuth").hidden = Boolean(authState.user?.mustChangePassword);
  authModal.hidden = false;
  document.querySelector(mode === "login" ? "#localLoginEmail" : "#localCurrentPassword").focus();
}

function renderProjectIdentity() {
  const root = document.querySelector("#projectAuth");
  root.replaceChildren();
  document.querySelector("#openSettingsButton").hidden = !authState.user || authState.user.role !== "admin" || authState.user.mustChangePassword;
  if (!authState.user) {
    const login = document.createElement("button"); login.type = "button"; login.textContent = "Entrar";
    login.addEventListener("click", () => openLocalAuth()); root.appendChild(login); return;
  }
  const menu = document.createElement("details"); menu.className = "account-menu";
  const summary = document.createElement("summary"); summary.setAttribute("aria-label", `Conta de ${authState.user.name}`);
  const avatar = document.createElement("span"); avatar.className = "user-avatar"; avatar.setAttribute("aria-hidden","true"); avatar.textContent = authState.user.name.split(/\s+/).slice(0,2).map(word => word[0]).join("").toUpperCase();
  const label = document.createElement("span"); label.className = "account-name"; label.textContent = authState.user.name;
  const caret = document.createElement("span"); caret.setAttribute("aria-hidden","true"); caret.textContent = "⌄";
  summary.append(avatar,label,caret); menu.appendChild(summary);
  const content = document.createElement("div"); content.className = "account-menu-content";
  const profile = document.createElement("p"); profile.textContent = authState.user.role === "admin" ? "Administrador" : "Colaborador"; content.appendChild(profile);
  const addButton = (text,action) => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = text;
    button.addEventListener("click", async () => { menu.open = false; try { await action(); } catch (error) { alert(error.message); } }); content.appendChild(button);
  };
  if (authState.user.role === "admin" && !authState.user.mustChangePassword) addButton("Usuários", async () => { await loadProjectIdentity(); renderLocalUsers(); usersModal.hidden = false; });
  addButton("Trocar senha", () => openLocalAuth("password"));
  addButton("Sair", async () => { await authRequest("/api/auth/logout", {}); location.reload(); });
  menu.appendChild(content); root.appendChild(menu);
}

const projectAuthReady = loadProjectIdentity().catch(() => {
  document.querySelector("#projectAuth").textContent = "Não foi possível verificar sua sessão. Atualize a página.";
});
window.fetch = async (input, init = {}) => {
  const requestUrl = new URL(input instanceof Request ? input.url : input, location.href);
  const method = (init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (requestUrl.origin === location.origin && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    await projectAuthReady;
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (authState.csrfToken) headers.set("X-CSRF-Token", authState.csrfToken);
    const response = await projectNativeFetch(input, { ...init, headers });
    if (response.status === 401 && !requestUrl.pathname.endsWith("/api/auth/login")) {
      authState.user = null; authState.csrfToken = null; authState.users = [];
      await loadProjectIdentity(); openLocalAuth();
    }
    return response;
  }
  return projectNativeFetch(input, init);
};

async function authRequest(path, body) {
  const response = await fetch(projectAuthBase + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
  return result;
}

async function runAuthForm(form, status, action) {
  const buttons = [...form.querySelectorAll("button:not([data-password-target])")];
  buttons.forEach(button => { button.disabled = true; });
  status.dataset.state = "pending";
  status.textContent = "Salvando…";
  try { await action(); status.textContent = ""; }
  catch (error) { status.dataset.state = "error"; status.textContent = error.message; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}

document.querySelector("#localLoginForm").addEventListener("submit", event => {
  event.preventDefault();
  runAuthForm(event.target, document.querySelector("#localAuthStatus"), async () => {
    await authRequest("/api/auth/login", { email: document.querySelector("#localLoginEmail").value, password: document.querySelector("#localLoginPassword").value });
    event.target.reset(); resetVisiblePasswords();
    authModal.hidden = true;
    await loadProjectIdentity();
    await loadProjects(); await refreshProjectNotifications();
  });
});
document.querySelector("#localPasswordForm").addEventListener("submit", event => {
  event.preventDefault();
  runAuthForm(event.target, document.querySelector("#localAuthStatus"), async () => {
    const password = document.querySelector("#localNewPassword").value;
    if (password !== document.querySelector("#localConfirmPassword").value) throw new Error("As senhas não conferem.");
    await authRequest("/api/auth/password", { currentPassword: document.querySelector("#localCurrentPassword").value, newPassword: password });
    event.target.reset(); resetVisiblePasswords(); authModal.hidden = true;
    await loadProjectIdentity(); await loadProjects(); await refreshProjectNotifications();
  });
});
document.querySelector("#closeLocalAuth").addEventListener("click", () => { if (!authState.user?.mustChangePassword) { authModal.hidden = true; document.querySelector("#localLoginPassword").value = ""; document.querySelector("#localPasswordForm").reset(); } });
document.querySelector("#closeLocalUsers").addEventListener("click", () => { usersModal.hidden = true; document.querySelector("#localInitialPassword").textContent = ""; document.querySelector("#localInitialPassword").hidden = true; document.querySelector(".initial-password-block").hidden = true; pendingInitialPassword = ""; });

let pendingInitialPassword = "";
function showInitialPassword(password) {
  pendingInitialPassword = password;
  document.querySelector(".initial-password-block").hidden = false;
  document.querySelector("#copyInitialPassword").textContent = "Copiar senha inicial";
  const output = document.querySelector("#localInitialPassword");
  output.textContent = `Senha inicial: ${password}. Entregue diretamente à pessoa. Ela deverá trocar a senha no primeiro acesso.`;
  output.hidden = false;
  output.scrollIntoView({ block: "nearest" });
}

function renderLocalUsers() {
  const list = document.querySelector("#localUsersList");
  list.replaceChildren();
  document.querySelector("#localUserCount").textContent = `(${authState.users.length})`;
  const query = document.querySelector("#localUserSearch").value.trim().toLocaleLowerCase("pt-BR");
  for (const user of authState.users.filter(user => !query || `${user.name} ${user.email}`.toLocaleLowerCase("pt-BR").includes(query))) {
    const row = document.createElement("div"); row.className = "local-user-row";
    const label = document.createElement("p"); label.textContent = user.name; const email = document.createElement("small"); email.textContent = user.email; label.appendChild(email); row.appendChild(label);
    if (user.id === authState.user.id) { const self = document.createElement("small"); self.textContent = "Sua conta · Administrador"; row.appendChild(self); list.appendChild(row); continue; }
    const role = document.createElement("select"); role.setAttribute("aria-label", `Perfil de ${user.name}`);
    role.add(new Option("Colaborador", "collaborator")); role.add(new Option("Administrador", "admin")); role.value = user.role;
    const activeLabel = document.createElement("label"); const active = document.createElement("input"); active.type = "checkbox"; active.checked = user.active;
    activeLabel.append(active, document.createTextNode("Ativo"));
    const save = document.createElement("button"); save.type = "button"; save.textContent = "Salvar acesso";
    const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "Redefinir senha";
    save.addEventListener("click", () => runAuthForm(row, document.querySelector("#localUsersStatus"), async () => { await authRequest(`/api/auth/users/${user.id}/update`, { role: role.value, active: active.checked }); await loadProjectIdentity(); renderLocalUsers(); }));
    reset.addEventListener("click", () => { if (!confirm(`Gerar nova senha inicial para ${user.name}? As sessões atuais serão encerradas.`)) return; runAuthForm(row, document.querySelector("#localUsersStatus"), async () => { const result = await authRequest(`/api/auth/users/${user.id}/reset-password`, {}); showInitialPassword(result.initialPassword); }); });
    row.append(role, activeLabel, save, reset); list.appendChild(row);
  }
  if (!list.children.length) { const empty = document.createElement("p"); empty.className = "hint"; empty.textContent = "Nenhuma pessoa encontrada. Tente outro nome ou e-mail."; list.appendChild(empty); }
}
document.querySelector("#localUserForm").addEventListener("submit", event => {
  event.preventDefault();
  runAuthForm(event.target, document.querySelector("#localUsersStatus"), async () => {
    const result = await authRequest("/api/auth/users", { name: document.querySelector("#localUserName").value, email: document.querySelector("#localUserEmail").value, role: document.querySelector("#localUserRole").value });
    event.target.reset(); showInitialPassword(result.initialPassword);
    await loadProjectIdentity(); renderLocalUsers();
  });
});

let projectNotifications = [];
async function refreshProjectNotifications() {
  await projectAuthReady;
  const button = document.querySelector("#notificationButton");
  button.hidden = !authState.user;
  if (!authState.user) return;
  try {
    const response = await fetch(`${projectAuthBase}/api/auth/notifications`, { cache: "no-store" });
    if (!response.ok) return;
    projectNotifications = await response.json();
    button.textContent = `Notificações (${projectNotifications.filter((entry) => !entry.seen).length})`;
    if (!document.querySelector("#notificationModal").hidden) renderProjectNotifications();
  } catch { /* Retry at the next refresh. */ }
}

function renderProjectNotifications() {
  const root = document.querySelector("#notificationList");
  root.replaceChildren();
  if (!projectNotifications.length) root.textContent = "Nenhuma notificação.";
  for (const notification of projectNotifications) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "management-attention-item";
    button.textContent = `${notification.seen ? "" : "Nova · "}${notification.author} · ${notification.title}: ${notification.text}`;
    button.addEventListener("click", async () => {
      await loadProjects();
      const project = projectsCache.find((entry) => entry.id === notification.projectId);
      const item = project?.workItems?.find((entry) => entry.id === notification.itemId);
      if (!item) { alert("Essa atividade foi excluída."); return; }
      document.querySelector("#notificationModal").hidden = true;
      openProject(project.id);
      openWorkItemEditor(project, item);
    });
    root.appendChild(button);
  }
}

document.querySelector("#notificationButton").addEventListener("click", async () => {
  renderProjectNotifications();
  document.querySelector("#notificationModal").hidden = false;
  try {
    const response = await fetch(`${projectAuthBase}/api/auth/notifications/read`, { method: "POST" });
    if (response.ok) await refreshProjectNotifications();
  } catch { /* Keep unread on failure. */ }
});
document.querySelector("#closeNotifications").addEventListener("click", () => { document.querySelector("#notificationModal").hidden = true; });
refreshProjectNotifications();
setInterval(refreshProjectNotifications, 60000);

function resetVisiblePasswords() {
  document.querySelectorAll('#localAuthModal [data-password-target]').forEach(button => {
    document.getElementById(button.dataset.passwordTarget).type = 'password';
    button.textContent = 'Mostrar'; button.setAttribute('aria-pressed','false');
  });
}
document.querySelector('#localUserSearch').addEventListener('input',renderLocalUsers);
document.querySelector('#copyInitialPassword').addEventListener('click',async event => {
  try { await navigator.clipboard.writeText(pendingInitialPassword); event.target.textContent = 'Senha copiada'; }
  catch { document.querySelector('#localUsersStatus').textContent = 'Selecione a senha exibida e copie com Ctrl+C.'; }
});
