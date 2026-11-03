/* Inline @ mentions keep recipients tied to a selected account. */
(() => {
  const input = document.querySelector('#commentText');
  const popup = document.querySelector('#mentionSuggestions');
  const recipients = document.querySelector('#mentionRecipients');
  const selected = new Map();
  let matches = [];
  let query = null;
  let active = 0;
  const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function tokenFor(user) {
    const duplicate = authState.users.some(other => other.active && other.id !== user.id && normalized(other.name) === normalized(user.name));
    return `@${duplicate ? user.email : user.name}`;
  }
  function containsToken(token) {
    let index = input.value.indexOf(token);
    while (index >= 0) {
      const before = input.value[index-1] || '';
      const after = input.value[index+token.length] || '';
      if ((!before || !/[\p{L}\p{N}@._+-]/u.test(before)) && (!after || !/[\p{L}\p{N}_]/u.test(after))) return true;
      index = input.value.indexOf(token,index+1);
    }
    return false;
  }
  function syncRecipients() {
    for (const [id,token] of selected) if (!containsToken(token) || !authState.users.some(user=>user.active && user.id===id)) selected.delete(id);
    const names = [...selected.keys()].map(id=>authState.users.find(user=>user.id===id)?.name).filter(Boolean);
    recipients.hidden = !names.length;
    recipients.textContent = names.length ? `Serão notificadas: ${names.join(', ')}` : '';
  }
  function hide() {
    popup.hidden = true;
    popup.replaceChildren();
    input.removeAttribute('aria-activedescendant');
    matches = []; query = null; active = 0;
  }
  function currentQuery() {
    if (input.selectionStart !== input.selectionEnd) return null;
    const before = input.value.slice(0,input.selectionStart);
    const match = /(^|[\s(])@([^@\n]{0,80})$/.exec(before);
    if (!match) return null;
    const start = before.length-match[2].length-1;
    const snippet = before.slice(start);
    if ([...selected.values()].some(token=>snippet.startsWith(token) && (snippet.length===token.length || /[\s.,!?;:]/.test(snippet[token.length])))) return null;
    return {start,end:input.selectionStart,text:normalized(match[2].trim())};
  }
  function highlight() {
    popup.querySelectorAll('[role=option]').forEach((option,index)=>option.setAttribute('aria-selected',String(index===active)));
    const option = popup.querySelector(`[data-mention-index="${active}"]`);
    if (option) { input.setAttribute('aria-activedescendant',option.id); option.scrollIntoView({block:'nearest'}); }
  }
  function choose(index) {
    const user = matches[index];
    if (!user || !query || collaborationBusy) return;
    const token = tokenFor(user);
    selected.set(user.id,token);
    input.focus();
    input.setRangeText(`${token} `,query.start,query.end,'end');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    hide(); syncRecipients();
  }
  function update() {
    syncRecipients();
    query = currentQuery();
    if (!query || collaborationBusy) { hide(); return; }
    matches = authState.users.filter(user=>user.active && (!query.text || normalized(`${user.name} ${user.email}`).includes(query.text))).slice(0,8);
    active = 0;
    popup.hidden = false;
    popup.innerHTML = matches.length ? matches.map((user,index)=>`<button type="button" id="mentionOption${index}" role="option" aria-selected="${index===active}" data-mention-index="${index}" data-mention-user-id="${escapeHtml(user.id)}" tabindex="-1"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></button>`).join('') : '<p>Nenhuma pessoa encontrada.</p>';
    popup.querySelectorAll('[data-mention-index]').forEach(button=>{
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.addEventListener('click',()=>choose(Number(button.dataset.mentionIndex)));
    });
    highlight();
  }
  input.addEventListener('input',update);
  input.addEventListener('click',update);
  input.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) update();});
  input.addEventListener('keydown',event=>{
    if (popup.hidden) return;
    if (event.key==='Escape') { event.preventDefault(); event.stopPropagation(); hide(); return; }
    if (!matches.length) return;
    if (['ArrowDown','ArrowUp'].includes(event.key)) {
      event.preventDefault(); active=(active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length; highlight();
    } else if ((event.key==='Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) || event.key==='Tab') {
      event.preventDefault(); choose(active);
    }
  });
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.mention-editor')) hide();},true);
  window.getCommentMentionIds = () => {syncRecipients(); return [...selected.keys()];};
  window.prefillProjectManagerMention = (userId, text) => {
    selected.clear();
    const user = authState.users.find(candidate => candidate.active && candidate.id === userId);
    const token = user ? tokenFor(user) : '';
    input.value = String(text || '').replace('{{responsavel}}', token || 'responsável');
    if (user && token) selected.set(user.id, token);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    syncRecipients();
  };
  window.syncCommentMentions = syncRecipients;
  window.resetCommentMentions = () => {selected.clear(); hide(); syncRecipients();};
})();
