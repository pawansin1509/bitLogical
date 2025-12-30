// Frontend using REST + Socket.IO when backend available; falls back to localStorage
const API_BASE = '';
let socket = null;
let currentToken = localStorage.getItem('token') || null;
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');

const postForm = document.getElementById('postForm');
const postingsEl = document.getElementById('postings');
const convsEl = document.getElementById('conversations');
const modal = document.getElementById('modal');
const closeModal = document.getElementById('closeModal');
const modalTitle = document.getElementById('modalTitle');
const messagesList = document.getElementById('messagesList');
const messageForm = document.getElementById('messageForm');
const senderNameInput = document.getElementById('senderName');
const messageTextInput = document.getElementById('messageText');
const authStatus = document.getElementById('authStatus');
const authLink = document.getElementById('authLink');
const logoutBtn = document.getElementById('logoutBtn');

function setAuthUI(){
  if(currentUser){
    authStatus.textContent = `Signed in: ${currentUser.name || currentUser.email}`;
    if(authLink) authLink.style.display = 'none';
    if(logoutBtn) logoutBtn.style.display = '';
  } else {
    authStatus.textContent = 'Not signed in';
    if(authLink) authLink.style.display = '';
    if(logoutBtn) logoutBtn.style.display = 'none';
  }
}
// initial UI update
setAuthUI();

async function api(path, opts={}){
  const headers = opts.headers || {};
  if(currentToken) headers['Authorization'] = 'Bearer '+currentToken;
  const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
  if(res.ok) return res.json();
  const err = await res.json().catch(()=>({error:'unknown'}));
  throw err;
}

async function fetchPostings(){
  try{ const list = await api('/api/postings'); renderPostings(list); await renderMyPostings(); }catch(e){ console.warn('API failed, falling back to localStorage'); renderPostings(loadPostings()); await renderMyPostings(); }
}

postForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const form = document.getElementById('postForm');
  const fd = new FormData(form);
  try{
    const posted = await api('/api/postings', { method:'POST', body: fd });
    await fetchPostings();
    form.reset();
  }catch(err){
    // fallback to localStorage
    const p = {
      id: Date.now().toString(36),
      type: document.getElementById('type').value,
      item: document.getElementById('item').value.trim(),
      desc: document.getElementById('desc').value.trim(),
      location: document.getElementById('location').value.trim(),
      contactName: document.getElementById('contactName').value.trim(),
      contactInfo: document.getElementById('contactInfo').value.trim(),
      created: Date.now()
    };
    const list = loadPostings(); list.push(p); savePostings(list);
    renderPostings(list);
    postForm.reset();
  }
});

// --- LocalStorage fallback helpers (keeps previous behavior) ---
function storage(key, value) { if (value === undefined) return JSON.parse(localStorage.getItem(key) || '[]'); localStorage.setItem(key, JSON.stringify(value)); }
function loadPostings(){ return storage('postings'); }
function savePostings(list){ storage('postings', list); }
function loadConversations(){ return storage('conversations'); }
function saveConversations(obj){ storage('conversations', obj); }

// Render postings from server data or local data
function renderPostings(list){
  const entries = list || loadPostings();
  postingsEl.innerHTML = '';
  if(!entries || entries.length===0){ postingsEl.innerHTML = '<p>No postings yet.</p>'; return }
  entries.slice().reverse().forEach(p=>{
    const el = document.createElement('div'); el.className='post';
    const avatar = createAvatar(p.contactName);
    let attachmentHtml = '';
    if(p.attachment){ attachmentHtml = `<div class="meta" style="margin-top:8px"><img src="${p.attachment}" style="max-width:160px;border-radius:10px;border:1px solid rgba(255,255,255,0.03)"></div>` }
    const pid = p._id || p.id;
    el.innerHTML = `<div class="avatar">${avatar}</div>
      <div class="content">
        <h4>${escapeHtml(p.item)} <span class="meta">(${p.type})</span></h4>
        <div class="meta small-muted">${formatTimeAgo(p.created)} • ${escapeHtml(p.desc)}</div>
        <div class="meta">Location: ${escapeHtml(p.location)}</div>
        <div class="meta">Contact: ${escapeHtml(p.contactName)} — ${escapeHtml(p.contactInfo)}</div>
        ${attachmentHtml}
        <div class="actions"><button class="btn small" data-id="${pid}">Message poster</button></div>
      </div>`;
    postingsEl.appendChild(el);
  });
}

// Message/conversation UI
function renderConversationsLocal(){
  const convs = loadConversations(); convsEl.innerHTML='';
  const keys = Object.keys(convs||{});
  if(keys.length===0){ convsEl.innerHTML='<p>No messages yet.</p>'; return }
  keys.reverse().forEach(id=>{ const c = convs[id]; const div = document.createElement('div'); div.className='conv'; div.textContent = `${c.posting.item} — ${c.posting.contactName}`; div.onclick = ()=>openConversation(id); convsEl.appendChild(div); });
}

async function openConversation(postingId){
  modal.classList.remove('hidden');
  modalTitle.textContent = 'Conversation';
  messagesList.innerHTML = '';
  try{
    const conv = await api('/api/conversations/'+postingId);
    conv.messages.forEach(m=> addMessageToList(m, m.fromUser === (currentUser && currentUser.id)) );
  }catch(e){
    // fallback to localStorage
    const convs = loadConversations(); const conv = convs[postingId]; if(conv){ conv.messages.forEach(m=> addMessageToList(m, m.me)); }
  }
  // connect socket
  ensureSocket();
  if(socket){ socket.emit('join', postingId); messageForm.dataset.id = postingId; senderNameInput.value = currentUser? currentUser.name:''; }
}

function addMessageToList(m, isMe){ const d = document.createElement('div'); d.className = 'message '+(isMe? 'me':'them'); d.innerHTML = `<div style="font-weight:600">${escapeHtml(m.name)}</div><div style="margin-top:6px">${escapeHtml(m.text)}</div><div class="small-muted" style="margin-top:6px;font-size:.8rem">${formatTimeAgo(m.ts)}</div>`; messagesList.appendChild(d); messagesList.scrollTop = messagesList.scrollHeight; }

// when socket receives a message (server sends conversationId in payload)
function handleIncomingMessage(m){
  // if open conv matches, append
  const currentConv = messageForm.dataset.convId;
  if(currentConv && m.conversationId && m.conversationId === currentConv){ addMessageToList(m, m.fromUser === (currentUser && currentUser.id)); }
  // optionally refresh conv list display
  renderConversations();
}

function closeConversation(){ modal.classList.add('hidden'); if(socket){ /* keep socket for reuse */ } }

postingsEl.addEventListener('click', e=>{
  const btn = e.target.closest('button'); if(!btn) return; const postingId = btn.dataset.id; if(!postingId) return;
  // start a private conversation (requires login)
  if(!currentToken){ window.location.href = '/login.html'; return; }
  startConversation(postingId);
});

async function startConversation(postingId){
  try{
    const conv = await api('/api/conversations', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ postingId }) });
    openConv(conv);
    renderConversations();
  }catch(err){ alert(err.error || 'Unable to start conversation'); }
}

function openConv(conv){
  modal.classList.remove('hidden');
  modalTitle.textContent = `${conv.posting.item} — ${conv.posting.contactName}`;
  messagesList.innerHTML = '';
  (conv.messages||[]).forEach(m=> addMessageToList(m, m.fromUser === (currentUser && currentUser.id)));
  messageForm.dataset.convId = conv.id;
  ensureSocket();
  if(socket) socket.emit('join', conv.id);
  senderNameInput.value = currentUser? currentUser.name:'';
}

messageForm.addEventListener('submit', e=>{
  e.preventDefault();
  const convId = messageForm.dataset.convId; if(!convId) return;
  const text = messageTextInput.value.trim(); if(!text) return;
  const name = currentUser? currentUser.name : senderNameInput.value.trim() || 'Anonymous';
  // Send via socket if available
  if(socket && socket.connected){
    socket.emit('message', { conversationId: convId, text, name });
  } else {
    // fallback save local
    const convs = loadConversations(); convs[convId] = convs[convId] || {posting:{item:'unknown'}, messages:[]}; convs[convId].messages.push({name,text,me:true,ts:Date.now()}); saveConversations(convs); renderConversationsLocal(); openConversation(convId);
  }
  messageTextInput.value='';
});

closeModal.addEventListener('click', closeConversation);
modal.addEventListener('click', e=>{ if(e.target===modal) closeConversation(); });

function escapeHtml(s){ return String(s).replace(/[&<>\\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c];}); }
function formatTimeAgo(ts){ if(!ts) return ''; const diff = Math.floor((Date.now()-ts)/1000); if(diff<60) return `${diff}s ago`; if(diff<3600) return `${Math.floor(diff/60)}m ago`; if(diff<86400) return `${Math.floor(diff/3600)}h ago`; const days = Math.floor(diff/86400); return `${days}d ago`; }

function createAvatar(name){ if(!name) return '👤'; const parts = name.trim().split(/\s+/); const initials = (parts[0][0] || '') + (parts[1] ? parts[1][0] : ''); return (initials || parts[0][0]||'U').toUpperCase(); }
// --- Socket management ---
function ensureSocket(){ if(socket && socket.connected) return socket; try{ socket = io({ auth: { token: currentToken } }); socket.on('connect', ()=>console.log('socket connected'));
  socket.on('message', m=>{ handleIncomingMessage(m); });
  socket.on('disconnect', ()=>console.log('socket disconnected')); return socket; }catch(e){ console.warn('socket failed',e); return null; }}

// --- Auth helpers ---
// (logoutBtn is declared earlier; just attach handler)
logoutBtn && logoutBtn.addEventListener('click', ()=>{
  localStorage.removeItem('token'); localStorage.removeItem('user'); currentToken = null; currentUser = null; setAuthUI();
  // redirect to login page
  window.location.href = '/login.html';
});

// Redirect to login page if not logged in
if(!currentToken){
  // send user to the login page
  window.location.href = '/login.html';
} else {
  ensureSocket();
}

// refresh UI
setAuthUI();


// Init
fetchPostings(); renderConversationsLocal();

async function renderConversations(){
  if(currentToken){
    try{
      const convs = await api('/api/conversations/mine');
      convsEl.innerHTML = '';
      if(!convs || convs.length===0){ convsEl.innerHTML = '<p>No messages yet.</p>'; return }
      convs.reverse().forEach(c=>{ const div = document.createElement('div'); div.className='conv'; div.textContent = `${c.posting.item} — ${c.posting.contactName}`; div.onclick = ()=>openConv(c); convsEl.appendChild(div); });
      return;
    }catch(e){ console.warn('fetch convs failed, falling back', e); }
  }
  renderConversationsLocal();
}

// --- My postings ---
const myPostingsEl = document.getElementById('myPostings');
async function renderMyPostings(){
  if(!currentToken){ myPostingsEl.innerHTML = '<p>Sign in to see your postings.</p>'; return; }
  try{
    const list = await api('/api/postings/mine');
    myPostingsEl.innerHTML = '';
    if(!list || list.length===0){ myPostingsEl.innerHTML = '<p>No postings yet.</p>'; return; }
    list.reverse().forEach(p=>{
      const pid = p._id || p.id;
      const d = document.createElement('div'); d.className='conv'; d.textContent = `${p.item} — ${p.type}`;
      const btn = document.createElement('button'); btn.className='btn small'; btn.style.marginLeft='8px'; btn.textContent='View'; btn.onclick = ()=>openMyPosting(p);
      const del = document.createElement('button'); del.className='btn small'; del.style.marginLeft='8px'; del.textContent='Delete'; del.onclick = ()=>deletePosting(pid);
      d.appendChild(btn); d.appendChild(del); myPostingsEl.appendChild(d);
    });
  }catch(e){ myPostingsEl.innerHTML = '<p>Error loading postings</p>'; }
}

function openMyPosting(p){
  // reuse modal
  modal.classList.remove('hidden');
  modalTitle.textContent = `${p.item} — ${p.type}`;
  messagesList.innerHTML = `<div class="meta">${escapeHtml(p.desc)}</div><div class="meta">Location: ${escapeHtml(p.location)}</div><div class="meta">Contact: ${escapeHtml(p.contactName)} — ${escapeHtml(p.contactInfo)}</div>`;
  messageForm.dataset.convId = '';
}

async function deletePosting(id){
  if(!confirm('Delete this posting?')) return;
  try{
    await api('/api/postings/'+id, { method: 'DELETE' });
    // refresh lists
    await fetchPostings(); await renderMyPostings(); await renderConversations();
    alert('Deleted');
  }catch(err){ alert(err.error || 'Delete failed'); }
}function storage(key, value) {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify(value));
}

function loadPostings() {
    return storage('postings');
}

function savePostings(list) {
    storage('postings', list);
}

function loadConversations() {
    return storage('conversations');
}

function saveConversations(obj) {
    storage('conversations', obj);
}

function renderPostings() {
    const list = loadPostings();
    postingsEl.innerHTML = '';
    if (list.length === 0) { postingsEl.innerHTML = '<p>No postings yet.</p>'; return }
    list.slice().reverse().forEach(p => {
        const el = document.createElement('div'); el.className = 'post';
        el.innerHTML = `<h4>${escapeHtml(p.item)} <span class="meta">(${p.type})</span></h4>
      <div class="meta">${escapeHtml(p.desc)}</div>
      <div class="meta">Location: ${escapeHtml(p.location)}</div>
      <div class="meta">Contact: ${escapeHtml(p.contactName)} — ${escapeHtml(p.contactInfo)}</div>
      <div class="actions"><button class="btn small" data-id="${p.id}">Message poster</button></div>`;
        postingsEl.appendChild(el);
    });
}

function renderConversations() {
    const convs = loadConversations();
    convsEl.innerHTML = '';
    const keys = Object.keys(convs || {});
    if (keys.length === 0) { convsEl.innerHTML = '<p>No messages yet.</p>'; return }
    keys.reverse().forEach(id => {
        const c = convs[id];
        const div = document.createElement('div'); div.className = 'conv';
        div.textContent = `${c.posting.item} — ${c.posting.contactName}`;
        div.onclick = () => openConversation(id);
        convsEl.appendChild(div);
    });
}

function openConversation(id) {
    const convs = loadConversations();
    const conv = convs[id];
    if (!conv) return;
    modalTitle.textContent = `${conv.posting.item} — ${conv.posting.contactName}`;
    messagesList.innerHTML = '';
    conv.messages.forEach(m => {
        const d = document.createElement('div'); d.className = 'message ' + (m.me ? 'me' : 'them');
        d.textContent = `${m.name}: ${m.text}`;
        messagesList.appendChild(d);
    });
    messageForm.dataset.id = id;
    modal.classList.remove('hidden');
}

function closeConversation() { modal.classList.add('hidden'); }

postForm.addEventListener('submit', e => {
    e.preventDefault();
    const p = {
        id: Date.now().toString(36),
        type: document.getElementById('type').value,
        item: document.getElementById('item').value.trim(),
        desc: document.getElementById('desc').value.trim(),
        location: document.getElementById('location').value.trim(),
        contactName: document.getElementById('contactName').value.trim(),
        contactInfo: document.getElementById('contactInfo').value.trim(),
        created: Date.now()
    };
    const list = loadPostings(); list.push(p); savePostings(list);
    renderPostings();
    postForm.reset();
});

postingsEl.addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const id = btn.dataset.id; if (!id) return;
    // create or open conversation
    let convs = loadConversations();
    convs = convs || {};
    if (!convs[id]) {
        const posts = loadPostings();
        const p = posts.find(x => x.id === id);
        convs[id] = { posting: p, messages: [] };
        saveConversations(convs);
        renderConversations();
    }
    openConversation(id);
});

messageForm.addEventListener('submit', e => {
    e.preventDefault();
    const id = messageForm.dataset.id;
    const name = senderNameInput.value.trim();
    const text = messageTextInput.value.trim();
    if (!id || !name || !text) return;
    const convs = loadConversations();
    convs[id].messages.push({ name, text, me: true, ts: Date.now() });
    saveConversations(convs);
    senderNameInput.value = ''; messageTextInput.value = '';
    openConversation(id);
    renderConversations();
});

closeModal.addEventListener('click', closeConversation);
modal.addEventListener('click', e => { if (e.target === modal) closeConversation(); });

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[c]; }); }

// Init
if (!localStorage.getItem('postings')) savePostings([]);
if (!localStorage.getItem('conversations')) saveConversations({});
// initial rendering
renderPostings(); renderConversations(); renderMyPostings();
