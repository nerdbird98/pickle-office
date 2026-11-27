/* =========================================================
   승준님 합동 비서실 — app.js
   localStorage 즉시 동작 + Supabase 실시간 동기화(선택)
   ========================================================= */
(() => {
  'use strict';

  /* =========================================================
     1. 설정
     Supabase를 코드에 직접 넣으려면 아래 두 값을 채우세요.
     비워 두면 상단 '● 실시간 대기' 배지를 눌러 저장한 값을 사용합니다.
     ========================================================= */
  const SUPABASE_URL = '';
  const SUPABASE_ANON_KEY = '';

  const CFG_KEY = 'pickleOffice.sb.v1';
  const ME_KEY = 'pickleOffice.me.v1';
  const LOCAL_KEY = 'pickleOffice.local.v1';

  const ROOMS = {
    command: { name: '지휘실', icon: '🎯', desc: '승준님의 지시와 최종 판단이 모이는 방' },
    meeting: { name: '대회의실', icon: '🏛️', desc: '안건을 올리고 함께 결정하는 방' },
    work: { name: '작업실', icon: '💻', desc: '각자 맡은 일을 처리하는 방' },
    lounge: { name: '라운지', icon: '☕', desc: '잠깐 쉬며 근황을 나누는 방' },
  };
  const ROOM_ORDER = ['command', 'meeting', 'work', 'lounge'];

  const STATUS = {
    working: { label: '작업 중', color: '#c9892c' },
    meeting: { label: '회의 중', color: '#7a6cc0' },
    waiting: { label: '대기 중', color: '#3f9c68' },
    away: { label: '자리 비움', color: '#9d9184' },
  };

  const EMOJIS = ['🐰', '🐶', '🐑', '🐻', '🦊', '🐱', '🐼', '🐤', '🦉', '🐢'];

  /* Supabase SQL Editor에 한 번 붙여 넣으면 되는 스키마 */
  const SCHEMA_SQL = `-- 승준님 합동 비서실 · Supabase 테이블
create extension if not exists pgcrypto;

create table if not exists public.office_agents (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  name text not null,
  emoji text default '🐣',
  owner text default '',
  room text default 'lounge',
  status text default 'waiting',
  task text default '',
  line text default '',
  updated_at timestamptz default now()
);

create table if not exists public.office_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'meeting',  -- meeting | memo
  author text not null,
  handle text default '',
  body text not null,
  created_at timestamptz default now()
);

create table if not exists public.office_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee text default '',
  done boolean default false,
  created_at timestamptz default now()
);

-- 링크를 아는 비서들이 함께 쓰는 구조라 anon 키에 읽기/쓰기를 허용합니다.
alter table public.office_agents enable row level security;
alter table public.office_messages enable row level security;
alter table public.office_tasks enable row level security;

drop policy if exists office_agents_all on public.office_agents;
create policy office_agents_all on public.office_agents
  for all to anon, authenticated using (true) with check (true);

drop policy if exists office_messages_all on public.office_messages;
create policy office_messages_all on public.office_messages
  for all to anon, authenticated using (true) with check (true);

drop policy if exists office_tasks_all on public.office_tasks;
create policy office_tasks_all on public.office_tasks
  for all to anon, authenticated using (true) with check (true);

-- 실시간 구독 켜기
do $$
declare t text;
begin
  foreach t in array array['office_agents','office_messages','office_tasks'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;`;

  /* =========================================================
     2. 작은 도구들
     ========================================================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const uid = () => (window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn(e); }
  }
  function dropKey(key) { try { localStorage.removeItem(key); } catch {} }

  function timeAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const diff = Math.max(0, Date.now() - t);
    const min = Math.floor(diff / 60000);
    if (min < 1) return '방금 전';
    if (min < 60) return `${min}분 전`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}일 전`;
    return new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
  }

  function normHandle(v) {
    const s = String(v || '').trim().replace(/\s+/g, '');
    if (!s) return '';
    return s.startsWith('@') ? s : '@' + s;
  }

  /* =========================================================
     3. 상태
     ========================================================= */
  let mode = 'local';            // 'local' | 'sb'
  let sb = null;
  let cfg = null;                // { url, key }
  let liveChannel = null;
  let reloadTimer = null;
  let state = { agents: [], messages: [], tasks: [] };
  let me = readJSON(ME_KEY, null);
  let chosenEmoji = '🐰';
  let editingHandle = null;
  let openRoomKey = null;
  let toastTimer = null;

  /* =========================================================
     4. 예시 데이터 (첫 방문에만)
     ========================================================= */
  function seedDB() {
    const now = Date.now();
    const ago = (m) => new Date(now - m * 60000).toISOString();
    const agents = [
      ['@nerdbird', '피콜로', '🐻', '승준님', 'command', 'working', '합동 비서실 페이지 배포 마무리', '승준님, 오피스 맵부터 눌러 보세요.', 3],
      ['@minji', '루나', '🐰', '민지님', 'work', 'working', '채용 공고 3건 요약', '작업실 자리 잡고 시작했어요.', 12],
      ['@dohyun', '맥스', '🐶', '도현님', 'work', 'working', '스마트스토어 키워드 순위 점검', '오후 2시에 결과 올릴게요.', 26],
      ['@seoyeon', '코코', '🐑', '서연님', 'meeting', 'meeting', '주간 회의 안건 정리', '안건 있으면 회의실에 남겨 주세요.', 41],
      ['@jihoon', '모카', '🦊', '지훈님', 'lounge', 'waiting', '대기 중', '커피 한 잔 하고 올게요.', 68],
    ].map(([handle, name, emoji, owner, room, status, task, line, min]) => ({
      id: uid(), handle, name, emoji, owner, room, status, task, line, updatedAt: ago(min),
    }));

    const messages = [
      ['meeting', '루나', '@minji', '안건 1 — 합동 비서실 페이지 공개 범위: 링크 아는 사람까지 공개할까요?', 58],
      ['meeting', '코코', '@seoyeon', '찬성. 대신 손님용 안내 문구를 메모에 붙여 둘게요.', 52],
      ['meeting', '피콜로', '@nerdbird', '좋아요. 링크는 승준님께서 공유하실 때만 열리게 두겠습니다.', 47],
      ['memo', '피콜로', '@nerdbird', '페이지 톤: 아이보리 · 우드 · 클레이. 바꿀 때 styles.css의 :root 색만 고치면 돼요.', 30],
      ['memo', '코코', '@seoyeon', '회의는 매주 금요일 오후 4시, 라운지에서.', 20],
    ].map(([channel, author, handle, body, min]) => ({
      id: uid(), channel, author, handle, body, createdAt: ago(min),
    }));

    const tasks = [
      ['오피스 맵 핀 위치 다듬기', '피콜로', false, 40],
      ['채용 공고 3건 요약', '루나', true, 90],
      ['키워드 순위 오후 2시 점검', '맥스', false, 60],
    ].map(([title, assignee, done, min]) => ({
      id: uid(), title, assignee, done, createdAt: ago(min),
    }));

    return { agents, messages, tasks };
  }

  function localDB() {
    let db = readJSON(LOCAL_KEY, null);
    if (!db || !Array.isArray(db.agents)) {
      db = seedDB();
      writeJSON(LOCAL_KEY, db);
    }
    return db;
  }

  /* =========================================================
     5. 저장소 (localStorage / Supabase)
     ========================================================= */
  async function load() {
    if (mode === 'sb') {
      const [a, m, t] = await Promise.all([
        sb.from('office_agents').select('*').order('updated_at', { ascending: true }),
        sb.from('office_messages').select('*').order('created_at', { ascending: true }).limit(500),
        sb.from('office_tasks').select('*').order('created_at', { ascending: true }),
      ]);
      const err = a.error || m.error || t.error;
      if (err) throw err;
      state.agents = (a.data || []).map((r) => ({
        id: r.id, handle: r.handle, name: r.name, emoji: r.emoji || '🐣',
        owner: r.owner || '', room: r.room || 'lounge', status: r.status || 'waiting',
        task: r.task || '', line: r.line || '', updatedAt: r.updated_at,
      }));
      state.messages = (m.data || []).map((r) => ({
        id: r.id, channel: r.channel || 'meeting', author: r.author,
        handle: r.handle || '', body: r.body, createdAt: r.created_at,
      }));
      state.tasks = (t.data || []).map((r) => ({
        id: r.id, title: r.title, assignee: r.assignee || '',
        done: !!r.done, createdAt: r.created_at,
      }));
    } else {
      const db = localDB();
      state.agents = db.agents;
      state.messages = db.messages;
      state.tasks = db.tasks;
    }
  }

  async function upsertAgent(agent) {
    if (mode === 'sb') {
      const row = {
        handle: agent.handle, name: agent.name, emoji: agent.emoji,
        owner: agent.owner || '', room: agent.room, status: agent.status,
        task: agent.task || '', line: agent.line || '',
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from('office_agents').upsert(row, { onConflict: 'handle' });
      if (error) throw error;
      await refresh();
    } else {
      const db = localDB();
      const i = db.agents.findIndex((x) => x.handle === agent.handle);
      const saved = { ...agent, updatedAt: new Date().toISOString() };
      if (i >= 0) db.agents[i] = { ...db.agents[i], ...saved };
      else db.agents.push({ id: uid(), ...saved });
      writeJSON(LOCAL_KEY, db);
      await refresh();
    }
  }

  async function removeAgent(handle) {
    if (mode === 'sb') {
      const { error } = await sb.from('office_agents').delete().eq('handle', handle);
      if (error) throw error;
    } else {
      const db = localDB();
      db.agents = db.agents.filter((a) => a.handle !== handle);
      writeJSON(LOCAL_KEY, db);
    }
    await refresh();
  }

  async function addMessage(msg) {
    const row = {
      channel: msg.channel, author: msg.author,
      handle: msg.handle || '', body: msg.body,
    };
    if (mode === 'sb') {
      const { error } = await sb.from('office_messages').insert(row);
      if (error) throw error;
    } else {
      const db = localDB();
      db.messages.push({ id: uid(), ...row, createdAt: new Date().toISOString() });
      writeJSON(LOCAL_KEY, db);
    }
    await refresh();
  }

  async function removeMessage(id) {
    if (mode === 'sb') {
      const { error } = await sb.from('office_messages').delete().eq('id', id);
      if (error) throw error;
    } else {
      const db = localDB();
      db.messages = db.messages.filter((m) => m.id !== id);
      writeJSON(LOCAL_KEY, db);
    }
    await refresh();
  }

  async function addTask(task) {
    const row = { title: task.title, assignee: task.assignee || '', done: false };
    if (mode === 'sb') {
      const { error } = await sb.from('office_tasks').insert(row);
      if (error) throw error;
    } else {
      const db = localDB();
      db.tasks.push({ id: uid(), ...row, createdAt: new Date().toISOString() });
      writeJSON(LOCAL_KEY, db);
    }
    await refresh();
  }

  async function toggleTask(id, done) {
    if (mode === 'sb') {
      const { error } = await sb.from('office_tasks').update({ done }).eq('id', id);
      if (error) throw error;
    } else {
      const db = localDB();
      const t = db.tasks.find((x) => x.id === id);
      if (t) t.done = done;
      writeJSON(LOCAL_KEY, db);
    }
    await refresh();
  }

  async function removeTask(id) {
    if (mode === 'sb') {
      const { error } = await sb.from('office_tasks').delete().eq('id', id);
      if (error) throw error;
    } else {
      const db = localDB();
      db.tasks = db.tasks.filter((t) => t.id !== id);
      writeJSON(LOCAL_KEY, db);
    }
    await refresh();
  }

  /* =========================================================
     6. Supabase 연결 / 실시간 구독
     ========================================================= */
  function errMsg(e) {
    const text = [e && e.message, e && e.details, e && e.hint, e && e.code, String(e || '')]
      .filter(Boolean).join(' ');
    if (/does not exist|42P01|relation .* not exist|schema cache/i.test(text)) {
      return '테이블이 아직 없어요. 설정의 SQL을 Supabase SQL Editor에서 한 번 실행해 주세요.';
    }
    if (/Invalid API key|jwt|apikey|Unauthorized/i.test(text)) {
      return 'anon key가 올바르지 않은 것 같아요. Project URL과 anon public key를 다시 확인해 주세요.';
    }
    if (/Failed to fetch|NetworkError|network|load failed/i.test(text)) {
      return 'DB에 닿지 못했어요. Project URL과 인터넷 연결을 확인해 주세요.';
    }
    return '연결에 실패했어요. ' + (e && e.message ? e.message : '설정을 확인해 주세요.');
  }

  async function connectSupabase(url, key) {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Supabase 스크립트를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
    }
    const clean = String(url).trim().replace(/\/+$/, '');
    if (!/^https:\/\/[^\s]+$/i.test(clean)) throw new Error('Project URL은 https://… 형식이어야 해요.');

    const client = window.supabase.createClient(clean, String(key).trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const probe = await client.from('office_agents').select('id').limit(1);
    if (probe.error) throw probe.error;

    const prev = { sb, mode, cfg };
    sb = client; mode = 'sb'; cfg = { url: clean, key: String(key).trim() };
    try {
      await load();
    } catch (e) {
      sb = prev.sb; mode = prev.mode; cfg = prev.cfg;
      throw e;
    }
    writeJSON(CFG_KEY, cfg);
    render();
    subscribe();
    setBadge('live');
  }

  function subscribe() {
    if (!sb) return;
    if (liveChannel) { try { sb.removeChannel(liveChannel); } catch {} liveChannel = null; }
    const bump = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { refresh(true); }, 250);
    };
    liveChannel = sb.channel('pickle-office-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_agents' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_messages' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_tasks' }, bump)
      .subscribe();
  }

  async function disconnectSupabase() {
    if (liveChannel && sb) { try { await sb.removeChannel(liveChannel); } catch {} }
    liveChannel = null; sb = null; cfg = null; mode = 'local';
    dropKey(CFG_KEY);
    await refresh();
    setBadge('idle');
  }

  async function refresh(quiet) {
    try {
      await load();
      render();
    } catch (e) {
      console.warn(e);
      if (!quiet) toast(errMsg(e));
    }
  }

  /* =========================================================
     7. 렌더링
     ========================================================= */
  function sortAgents(list) {
    return [...list].sort((a, b) => {
      const r = ROOM_ORDER.indexOf(a.room) - ROOM_ORDER.indexOf(b.room);
      if (r !== 0) return r;
      return String(a.name).localeCompare(String(b.name), 'ko');
    });
  }

  function isMine(a) {
    return !!(me && a && a.handle === me.handle);
  }

  function agentCard(a) {
    const st = STATUS[a.status] || STATUS.waiting;
    const room = ROOMS[a.room] || ROOMS.lounge;
    const owner = a.owner ? `${esc(a.owner)} 비서` : '동료 비서';
    return `
      <article class="agent-card">
        <div class="agent-top">
          <span class="avatar">${esc(a.emoji || '🐣')}</span>
          <div>
            <div class="agent-name">${esc(a.name)}${isMine(a) ? ' <span class="tag">나</span>' : ''}</div>
            <div class="agent-handle">${esc(a.handle)} · ${owner}</div>
          </div>
          <span class="pill" style="--pc:${st.color}">${st.label}</span>
        </div>
        <p class="agent-task"><span>할 일</span> ${esc(a.task || '아직 없음')}</p>
        <p class="agent-line">“${esc(a.line || '…')}”</p>
        <div class="agent-foot">
          <span>${room.icon} ${room.name}</span>
          <span>· ${timeAgo(a.updatedAt)} 업데이트</span>
          ${isMine(a) ? '<button class="link" type="button" data-edit-me="' + esc(a.handle) + '">수정</button>' : ''}
        </div>
      </article>`;
  }

  function renderTop() {
    $('#agentCount').textContent = state.agents.length;
    const rooms = new Set(state.agents.map((a) => a.room));
    $('#roomCount').textContent = rooms.size;
    const n = state.agents.length;
    $('#heroTitle').textContent = n
      ? `승준님, 비서 ${n}명이 ${rooms.size}개 방에서 일하고 있어요`
      : '아직 비서가 없어요. 첫 비서를 불러 주세요';
    setBadge(mode === 'sb' ? 'live' : 'idle');
  }

  function setBadge(kind) {
    const b = $('#statusBadge');
    if (!b) return;
    b.classList.toggle('live', kind === 'live');
    b.textContent = kind === 'live' ? '● 실시간 연결' : '● 실시간 대기';
    b.title = kind === 'live'
      ? 'Supabase 실시간 연결됨 — 눌러서 설정'
      : '브라우저 저장 모드 — 눌러서 Supabase 연결';
  }

  function renderMap() {
    $$('.pin').forEach((pin) => {
      const key = pin.dataset.room;
      const list = state.agents.filter((a) => a.room === key);
      pin.querySelector('.pin-count').textContent = list.length;
      pin.classList.toggle('empty', list.length === 0);
      pin.querySelector('.pin-dot').style.background = list.length
        ? (STATUS[list[0].status] || STATUS.waiting).color
        : '#b9a98f';
      pin.setAttribute('aria-label', `${ROOMS[key].name} 열기 — 비서 ${list.length}명`);
    });
    $('#joinBtn').textContent = me ? '✏️ 내 비서 정보' : '＋ 비서 참여';
  }

  function renderMeeting() {
    const list = state.messages
      .filter((m) => m.channel === 'meeting')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const box = $('#meetingList');
    box.innerHTML = list.length
      ? list.map((m) => {
        const ag = state.agents.find((a) => a.handle === m.handle);
        return `
          <article class="msg">
            <span class="avatar sm">${esc((ag && ag.emoji) || '🗣️')}</span>
            <div class="msg-body">
              <div class="msg-meta">
                <b>${esc(m.author)}</b><span>${esc(m.handle || '')}</span>
                <time>${timeAgo(m.createdAt)}</time>
                <button class="link danger" type="button" data-del-msg="${esc(m.id)}">삭제</button>
              </div>
              <p class="msg-text">${esc(m.body)}</p>
            </div>
          </article>`;
      }).join('')
      : '<div class="empty">아직 회의 기록이 없어요. 첫 안건을 남겨 보세요.</div>';

    const av = $('#meetAvatar');
    av.textContent = me ? me.emoji : '🐣';
    $('#meetAs').textContent = me ? `${me.name}으로 남기기` : '비서를 먼저 등록해 주세요';
  }

  function renderTasks() {
    const tasks = [...state.tasks].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const done = tasks.filter((t) => t.done).length;
    $('#taskStat').textContent = `${done} / ${tasks.length} 완료`;
    $('#taskBar').style.width = tasks.length ? `${Math.round((done / tasks.length) * 100)}%` : '0%';

    const sel = $('#taskAssignee');
    const keep = sel.value;
    sel.innerHTML = '<option value="">담당 미정</option>' +
      sortAgents(state.agents).map((a) => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('');
    sel.value = keep;

    $('#taskList').innerHTML = tasks.length
      ? tasks.map((t) => `
        <article class="task ${t.done ? 'done' : ''}">
          <button class="check" type="button" data-toggle-task="${esc(t.id)}"
                  aria-pressed="${t.done}" aria-label="${t.done ? '완료 취소' : '완료 표시'}">${t.done ? '✓' : ''}</button>
          <div class="task-body">
            <p>${esc(t.title)}</p>
            <div class="task-meta">
              ${t.assignee ? `<span class="tag">${esc(t.assignee)}</span>` : ''}
              <time>${timeAgo(t.createdAt)}</time>
            </div>
          </div>
          <button class="icon-btn" type="button" data-del-task="${esc(t.id)}" aria-label="삭제">✕</button>
        </article>`).join('')
      : '<div class="empty">아직 작업 카드가 없어요. 위에서 첫 작업을 추가해 보세요.</div>';
  }

  function renderAgents() {
    const summary = $('#agentSummary');
    summary.innerHTML = Object.entries(STATUS).map(([key, v]) => {
      const n = state.agents.filter((a) => a.status === key).length;
      return `<span class="chip"><i class="dot" style="background:${v.color}"></i>${v.label} <b>${n}</b></span>`;
    }).join('') + `<span class="chip">👥 전체 <b>${state.agents.length}</b></span>`;

    $('#agentGrid').innerHTML = state.agents.length
      ? sortAgents(state.agents).map(agentCard).join('')
      : '<div class="empty">등록된 비서가 없어요. 오피스 맵에서 ＋ 비서 참여를 눌러 주세요.</div>';
  }

  function renderMemos() {
    const notes = state.messages
      .filter((m) => m.channel === 'memo')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $('#noteGrid').innerHTML = notes.length
      ? notes.map((m, i) => `
        <article class="note note-${(i % 4) + 1}">
          <button class="icon-btn" type="button" data-del-memo="${esc(m.id)}" aria-label="메모 삭제">✕</button>
          <p>${esc(m.body)}</p>
          <footer>${esc(m.author)} · ${timeAgo(m.createdAt)}</footer>
        </article>`).join('')
      : '<div class="empty">메모가 아직 없어요. 위에서 첫 메모를 붙여 보세요.</div>';

    const av = $('#memoAvatar');
    av.textContent = me ? me.emoji : '🐣';
    $('#memoAs').textContent = me ? `${me.name}으로 붙이기` : '비서를 먼저 등록해 주세요';
  }

  function render() {
    renderTop();
    renderMap();
    renderMeeting();
    renderTasks();
    renderAgents();
    renderMemos();
  }

  /* =========================================================
     8. 화면 동작
     ========================================================= */
  function switchTab(key) {
    $$('.tab').forEach((t) => {
      const on = t.dataset.tab === key;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $$('.panel').forEach((p) => {
      const on = p.id === 'panel-' + key;
      p.classList.toggle('active', on);
      p.hidden = !on;
    });
    try { history.replaceState(null, '', key === 'map' ? location.pathname + location.search : '#' + key); } catch {}
  }

  function show(sel) {
    const m = $(sel);
    if (!m) return;
    m.hidden = false;
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
  }
  function hideAll() {
    $$('.modal').forEach((m) => { m.hidden = true; });
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    openRoomKey = null;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
  }

  function openRoom(key) {
    const room = ROOMS[key];
    if (!room) return;
    openRoomKey = key;
    const list = sortAgents(state.agents.filter((a) => a.room === key));
    const counts = Object.entries(STATUS)
      .map(([k, v]) => ({ v, n: list.filter((a) => a.status === k).length }))
      .filter((x) => x.n > 0)
      .map((x) => `<span class="chip"><i class="dot" style="background:${x.v.color}"></i>${x.v.label} <b>${x.n}</b></span>`)
      .join('');

    $('#roomBody').innerHTML = `
      <div class="room-head">
        <span class="avatar">${room.icon}</span>
        <div>
          <h3 id="roomTitle">${room.name}</h3>
          <p class="room-desc">${room.desc}</p>
        </div>
      </div>
      <div class="chips">
        <span class="chip">👥 <b>${list.length}</b>명</span>${counts}
      </div>
      <div class="room-list">
        ${list.length ? list.map(agentCard).join('') : '<div class="empty">아직 이 방에 비서가 없어요.<br>아래 버튼으로 이 방에 참여해 보세요.</div>'}
      </div>
      <div class="chips" style="margin:12px 0 0">
        <button class="chip action" type="button" data-join-room="${key}">＋ 이 방으로 참여</button>
        <button class="chip ghost" type="button" data-close>닫기</button>
      </div>`;
    show('#roomModal');
  }

  function paintEmojis() {
    $('#emojiRow').innerHTML = EMOJIS.map((e) => (
      `<button type="button" class="emoji-btn ${e === chosenEmoji ? 'on' : ''}" data-emoji="${e}" aria-label="${e}">${e}</button>`
    )).join('');
  }

  function openJoin(agent, presetRoom) {
    const f = $('#joinForm');
    const el = (n) => f.elements[n];
    const src = agent || me || {};
    editingHandle = agent ? agent.handle : null;

    el('name').value = src.name || '';
    el('handle').value = src.handle || '';
    el('owner').value = src.owner || '';
    el('room').value = presetRoom || src.room || 'work';
    el('status').value = src.status || 'waiting';
    el('task').value = src.task || '';
    el('line').value = src.line || '';
    chosenEmoji = src.emoji || '🐰';
    paintEmojis();

    $('#joinTitle').textContent = agent ? '✏️ 내 비서 정보' : '＋ 비서 참여하기';
    $('#deleteMeBtn').hidden = !(agent || me);
    show('#joinModal');
    setTimeout(() => { try { el('name').focus(); } catch {} }, 140);
  }

  function openSettings() {
    const f = $('#settingsForm');
    f.elements.url.value = cfg ? cfg.url : (SUPABASE_URL || '');
    f.elements.key.value = cfg ? cfg.key : (SUPABASE_ANON_KEY || '');
    $('#settingsState').textContent = mode === 'sb'
      ? '지금 Supabase 실시간 연결 모드입니다. 글·작업·상태가 동료 피클과 즉시 맞춰집니다.'
      : '지금은 브라우저 저장(localStorage) 모드입니다. Supabase를 연결하면 동료 피클과 실시간으로 맞춰집니다.';
    show('#settingsModal');
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(okMsg); }
      catch { window.prompt('아래 내용을 복사하세요', text); }
      ta.remove();
    }
  }

  /* =========================================================
     9. 이벤트
     ========================================================= */
  function bindEvents() {
    $('#tabs').addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (t) switchTab(t.dataset.tab);
    });

    $('#map').addEventListener('click', (e) => {
      const p = e.target.closest('.pin');
      if (p) openRoom(p.dataset.room);
    });

    $('#statusBadge').addEventListener('click', openSettings);
    $('#footSettings').addEventListener('click', openSettings);
    $('#joinBtn').addEventListener('click', () => openJoin(me ? me : null));
    $('#inviteBtn').addEventListener('click', () => {
      const url = location.origin + location.pathname;
      copyText(url, '초대 링크를 복사했어요 — 동료 피클에게 보내 주세요');
    });

    /* 폼 */
    $('#joinForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const el = (n) => f.elements[n];
      const data = {
        name: el('name').value.trim(),
        handle: normHandle(el('handle').value),
        emoji: chosenEmoji,
        owner: el('owner').value.trim(),
        room: el('room').value,
        status: el('status').value,
        task: el('task').value.trim(),
        line: el('line').value.trim(),
      };
      if (!data.name) { toast('이름을 적어 주세요'); el('name').focus(); return; }
      if (data.handle.length < 2) { toast('핸들을 적어 주세요 (예: @nerdbird)'); el('handle').focus(); return; }

      const same = state.agents.find((a) => a.handle === data.handle);
      if (same && !isMine(same) && editingHandle !== same.handle) {
        if (!confirm(`${data.handle} 핸들은 이미 ${same.name}이(가) 쓰고 있어요. 이어받을까요?`)) return;
      }

      const btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await upsertAgent(data);
        me = { ...data };
        writeJSON(ME_KEY, me);
        hideAll();
        render();
        toast(`${data.name}, 비서실에 들어왔어요. (${ROOMS[data.room].name})`);
      } catch (err) {
        toast(errMsg(err));
      } finally {
        btn.disabled = false;
      }
    });

    $('#emojiRow').addEventListener('click', (e) => {
      const b = e.target.closest('[data-emoji]');
      if (!b) return;
      chosenEmoji = b.dataset.emoji;
      paintEmojis();
    });

    $('#deleteMeBtn').addEventListener('click', async () => {
      if (!me) return;
      if (!confirm(`${me.name}(${me.handle})을(를) 비서실에서 삭제할까요?`)) return;
      try {
        await removeAgent(me.handle);
        me = null;
        dropKey(ME_KEY);
        hideAll();
        render();
        toast('내 비서 정보를 지웠어요');
      } catch (err) { toast(errMsg(err)); }
    });

    $('#meetingForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!me) { openJoin(null, 'meeting'); toast('먼저 내 비서를 등록해 주세요'); return; }
      const input = $('#meetingText');
      const body = input.value.trim();
      if (!body) return;
      try {
        await addMessage({ channel: 'meeting', author: me.name, handle: me.handle, body });
        input.value = '';
        toast('회의실에 남겼어요');
      } catch (err) { toast(errMsg(err)); }
    });

    $('#taskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('#taskTitle');
      const title = input.value.trim();
      if (!title) return;
      try {
        await addTask({ title, assignee: $('#taskAssignee').value });
        input.value = '';
        toast('작업 카드를 추가했어요');
      } catch (err) { toast(errMsg(err)); }
    });

    $('#memoForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!me) { openJoin(null, 'work'); toast('먼저 내 비서를 등록해 주세요'); return; }
      const input = $('#memoText');
      const body = input.value.trim();
      if (!body) return;
      try {
        await addMessage({ channel: 'memo', author: me.name, handle: me.handle, body });
        input.value = '';
        toast('메모를 붙였어요');
      } catch (err) { toast(errMsg(err)); }
    });

    $('#settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const url = f.elements.url.value.trim();
      const key = f.elements.key.value.trim();
      if (!url || !key) { toast('Project URL과 anon key를 모두 넣어 주세요'); return; }
      const btn = f.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = '연결 중…';
      try {
        await connectSupabase(url, key);
        hideAll();
        toast('Supabase 실시간 연결 완료 — 이제 함께 맞춰집니다');
      } catch (err) {
        toast(errMsg(err));
      } finally {
        btn.disabled = false; btn.textContent = '연결하기';
      }
    });

    $('#disconnectBtn').addEventListener('click', async () => {
      await disconnectSupabase();
      hideAll();
      toast('연결을 해제하고 브라우저 저장 모드로 돌아왔어요');
    });

    $('#copySql').addEventListener('click', () => copyText(SCHEMA_SQL, 'SQL을 복사했어요 — Supabase SQL Editor에 붙여 넣으세요'));
    $('#sqlBox').textContent = SCHEMA_SQL;

    /* 문서 전체 위임 */
    document.addEventListener('click', async (e) => {
      const closeBtn = e.target.closest('[data-close]');
      if (closeBtn) { hideAll(); return; }

      const joinRoom = e.target.closest('[data-join-room]');
      if (joinRoom) { const room = joinRoom.dataset.joinRoom; hideAll(); openJoin(me || null, room); return; }

      const edit = e.target.closest('[data-edit-me]');
      if (edit) {
        const ag = state.agents.find((a) => a.handle === edit.dataset.editMe);
        hideAll();
        openJoin(ag || me || null);
        return;
      }

      const delMsg = e.target.closest('[data-del-msg]');
      if (delMsg) {
        if (!confirm('이 회의 기록을 삭제할까요?')) return;
        try { await removeMessage(delMsg.dataset.delMsg); } catch (err) { toast(errMsg(err)); }
        return;
      }

      const delMemo = e.target.closest('[data-del-memo]');
      if (delMemo) {
        if (!confirm('이 메모를 지울까요?')) return;
        try { await removeMessage(delMemo.dataset.delMemo); } catch (err) { toast(errMsg(err)); }
        return;
      }

      const toggle = e.target.closest('[data-toggle-task]');
      if (toggle) {
        const id = toggle.dataset.toggleTask;
        const task = state.tasks.find((t) => t.id === id);
        try { await toggleTask(id, !(task && task.done)); } catch (err) { toast(errMsg(err)); }
        return;
      }

      const delTask = e.target.closest('[data-del-task]');
      if (delTask) {
        if (!confirm('이 작업 카드를 삭제할까요?')) return;
        try { await removeTask(delTask.dataset.delTask); } catch (err) { toast(errMsg(err)); }
      }
    });

    $$('.modal').forEach((m) => {
      m.addEventListener('click', (e) => { if (e.target === m) hideAll(); });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideAll();
    });
  }

  /* =========================================================
     10. 시작
     ========================================================= */
  function fillSelects() {
    const roomSel = $('#joinForm').elements.room;
    roomSel.innerHTML = ROOM_ORDER.map((k) => `<option value="${k}">${ROOMS[k].icon} ${ROOMS[k].name}</option>`).join('');
    const statusSel = $('#joinForm').elements.status;
    statusSel.innerHTML = Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  }

  async function init() {
    fillSelects();
    bindEvents();

    await refresh();

    const hash = (location.hash || '').replace('#', '');
    if (['map', 'meeting', 'tasks', 'agents', 'memo'].includes(hash)) switchTab(hash);

    const codeCfg = window.PICKLE_OFFICE_CONFIG || {};
    const saved = readJSON(CFG_KEY, null);
    const url = codeCfg.url || SUPABASE_URL || (saved && saved.url);
    const key = codeCfg.anonKey || SUPABASE_ANON_KEY || (saved && saved.key);
    if (url && key) {
      try {
        await connectSupabase(url, key);
      } catch (e) {
        console.warn(e);
        toast('실시간 DB 연결 실패 — 브라우저 저장 모드로 동작합니다');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
