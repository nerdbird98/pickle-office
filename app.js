/* =========================================================
   Thomas 연구소 — app.js
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
    command: { name: '연구소장실', icon: '🎯', desc: 'Thomas의 지시와 최종 판단이 모이는 방' },
    meeting: { name: '대회의실', icon: '🏛️', desc: '안건을 올리고 함께 결정하는 방' },
    work: { name: '연구소', icon: '💻', desc: '각자 맡은 연구과제를 처리하는 방' },
    lounge: { name: '라운지', icon: '☕', desc: '잠깐 쉬며 근황을 나누는 방' },
    invest: { name: '투자연구소', icon: '📈', desc: '금융 차트와 응모·추첨 현황을 칠판에 붙여 두고 보는 방' },
  };
  const ROOM_ORDER = ['command', 'meeting', 'work', 'lounge', 'invest'];

  const STATUS = {
    working: { label: '작업 중', color: '#c9892c' },
    meeting: { label: '회의 중', color: '#7a6cc0' },
    waiting: { label: '대기 중', color: '#3f9c68' },
    away: { label: '자리 비움', color: '#9d9184' },
  };

  const EMOJIS = ['🐰', '🐶', '🐑', '🐻', '🦊', '🐱', '🐼', '🐤', '🦉', '🐢'];

  /* =========================================================
     투자연구소 칠판/현황판
     실제 내용은 data/invest-board.json 에 있고, 그 파일을 못 읽으면
     아래 기본값으로 보여 줍니다. 매주 추첨 결과는 JSON만 고치면 됩니다.
     ========================================================= */
  const INVEST_BOARD_URL = 'data/invest-board.json?v=1';
  const INVEST_BOARD_BASE = {
    events: {
      title: '이벤트 응모 현황',
      subtitle: 'Piccolo가 대신 응모하고 당첨 발표를 챙깁니다',
      items: [
        { icon: '📝', title: '공공기관 설문 경품 응모', status: '누적 25건 완료', note: '매일 12:30 자동 응모 중', tone: 'done' },
        { icon: '⚡', title: '한국전력 전력퀴즈', status: '응모 완료', note: '11/30 마감 · 당첨 시 문자 안내', tone: 'done' },
        { icon: '🎁', title: '네이버 무료체험단 (닥터펩티 세럼)', status: '2건 응모 완료', note: '12/2 발표', tone: 'done' },
        { icon: '🎱', title: '로또 1252회 (5게임) · 연금복권 344회 (5조합)', status: '참여 번호 기록 완료', note: '토/목 추첨 비교', tone: 'watch' },
      ],
    },
    draws: {
      title: '로또·연금복권 예측 & 결과 비교',
      subtitle: '당첨 번호만 채우면 자동으로 등수까지 비교합니다',
      items: [
        {
          game: '로또 6/45', round: '1252회',
          drawLabel: '11/28(토) 21:15 추첨', status: '추첨 대기',
          compareNote: '추첨 대기 (11/28 21:15 비교 예정)',
          winning: null, bonus: null,
          plays: [
            { label: '1게임', numbers: [4, 13, 18, 19, 34, 38] },
            { label: '2게임', numbers: [14, 16, 17, 29, 30, 42] },
            { label: '3게임', numbers: [3, 6, 12, 22, 27, 37] },
            { label: '4게임', numbers: [11, 15, 24, 28, 39, 45] },
            { label: '5게임', numbers: [1, 8, 23, 35, 36, 40] },
          ],
        },
        {
          game: '연금복권720+', round: '344회',
          drawLabel: '12/3(목) 19:30 추첨', status: '추첨 대기',
          compareNote: '추첨 대기 (12/3 19:30 비교 예정)',
          note: '세트 1순위 634912',
          winning: null, winningGroup: null,
          plays: [
            { label: '1게임', group: 3, digits: '634910' },
            { label: '2게임', group: 4, digits: '161347' },
            { label: '3게임', group: 1, digits: '631912' },
            { label: '4게임', group: 2, digits: '054519' },
            { label: '5게임', group: 5, digits: '813548' },
          ],
        },
      ],
    },
  };
  let investBoard = INVEST_BOARD_BASE;
  let boardFetched = false;

  /* =========================================================
     자료실 (docs/)
     목록은 data/documents.json 에 있고, 못 읽으면 아래 기본값으로 보여 줍니다.
     새 문서는 docs/에 파일을 넣고 documents.json에 한 줄 추가하면 됩니다.
     ========================================================= */
  const DOCS_URL = 'data/documents.json?v=1';
  const DOCS_BASE = {
    updated: '2026-11-28',
    docs: [
      {
        tag: '기획서', icon: '📄',
        title: '아트스캔(온라인 미술 감별소) 사업기획서 v1.2',
        meta: 'Word .docx · 574KB · 2026-11-28 · v1.2',
        desc: '사업 개요, 시장·경쟁 분석, 감별 프로세스와 수익 모델, 백테스트, MVP 범위, 로드맵, 리스크 관리까지 담은 본문 기획서.',
        file: 'docs/artscan-business-plan-v1.2.docx',
        name: '아트스캔-사업기획서-v1.2-2026-11-28.docx',
      },
      {
        tag: '발표자료', icon: '📊',
        title: '아트스캔 사업기획서 발표자료 (14장)',
        meta: 'PowerPoint .pptx · 2.5MB · 2026-11-28',
        desc: '표지·요약·시장·경쟁·수익 구조·백테스트·경매 공식·MVP·로드맵 순서의 14장 슬라이드.',
        file: 'docs/artscan-business-plan-v1.2.pptx',
        name: '아트스캔-사업기획서-발표자료-2026-11-28.pptx',
      },
      {
        tag: '읽기용', icon: '📕',
        title: '아트스캔 사업기획서 PDF',
        meta: 'PDF · 1.0MB · 2026-11-28',
        desc: '발표자료를 그대로 PDF로 묶은 파일. 휴대폰에서 바로 넘겨 보기 좋습니다.',
        file: 'docs/artscan-business-plan-v1.2.pdf',
        name: '아트스캔-사업기획서-2026-11-28.pdf',
      },
    ],
  };
  let docsBoard = DOCS_BASE;

  /* Supabase SQL Editor에 한 번 붙여 넣으면 되는 스키마 */
  const SCHEMA_SQL = `-- Thomas 연구소 · Supabase 테이블
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

  /* esc()를 거친 글 안의 링크를 눌러 열 수 있게 바꿉니다 */
  function linkify(safeText) {
    return String(safeText ?? '').replace(/((?:https?:\/\/|www\.)[^\s<]+)/g, (m) => {
      const tail = m.match(/[.,)\]》」'…]+$/);
      const url = tail ? m.slice(0, -tail[0].length) : m;
      return `<a href="${url}" target="_blank" rel="noopener">${url}</a>` + (tail ? tail[0] : '');
    });
  }

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

  /* 이름 뒤에 붙는 '으로/로' 조사 (받침 유무) */
  function roJosa(word) {
    const s = String(word || '').trim();
    if (!s) return '로';
    const code = s.charCodeAt(s.length - 1);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const jong = (code - 0xac00) % 28;
      return (jong === 0 || jong === 8) ? '로' : '으로';
    }
    return '로';
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
     4. 기본 데이터 (첫 방문에만) — Piccolo 한 명만
     ========================================================= */
  const SEED_AGENT = {
    handle: '@nerdbird',
    name: 'Piccolo',
    emoji: '🐻',
    owner: 'Thomas',
    room: 'command',
    status: 'working',
    task: '연구소 페이지 배포 마무리',
    line: 'Thomas, 오피스 맵부터 눌러 보세요.',
  };

  /* 예전 버전이 브라우저에 남긴 예시 데이터 — 자동 정리 대상 */
  const SAMPLE_HANDLES = ['@minji', '@dohyun', '@seoyeon', '@jihoon'];
  const SAMPLE_BODIES = [
    '안건 1 — 합동 비서실 페이지 공개 범위: 링크 아는 사람까지 공개할까요?',
    '찬성. 대신 손님용 안내 문구를 메모에 붙여 둘게요.',
    /* 아래 두 줄은 예전 시드 문구 그대로 — 저장된 예시 데이터를 가려내야 해서 고치지 않습니다 */
    '좋아요. 링크는 승준님께서 공유하실 때만 열리게 두겠습니다.',
    '페이지 톤: 아이보리 · 우드 · 클레이. 바꿀 때 styles.css의 :root 색만 고치면 돼요.',
    '회의는 매주 금요일 오후 4시, 라운지에서.',
  ];
  const SAMPLE_TASKS = ['오피스 맵 핀 위치 다듬기', '채용 공고 3건 요약', '키워드 순위 오후 2시 점검'];
  /* 예전 표기 이름 → 지금 이름 */
  const LEGACY_PERSON = { '승준님': 'Thomas' };
  const LEGACY_AI = { '피콜로': 'Piccolo' };
  const LEGACY_SEED_LINE = '승준님, 오피스 맵부터 눌러 보세요.';
  const SEED_FLAG_KEY = 'pickleOffice.seed.v2';

  function seedAgent() {
    return {
      id: uid(), ...SEED_AGENT,
      updatedAt: new Date(Date.now() - 3 * 60000).toISOString(),
    };
  }

  function seedDB() {
    return { agents: [seedAgent()], messages: [], tasks: [] };
  }

  /* 예시 비서·회의·작업·메모를 걷어내고 Piccolo 한 명만 남깁니다. (한 번만 실행) */
  function tidyDB(db) {
    if (!db || !Array.isArray(db.agents)) return seedDB();
    db.messages = (db.messages || []).filter((m) => !SAMPLE_BODIES.includes(String(m.body || '').trim()));
    db.tasks = (db.tasks || []).filter((t) => !SAMPLE_TASKS.includes(String(t.title || '').trim()));
    db.agents = db.agents.filter((a) => !SAMPLE_HANDLES.includes(String(a.handle || '').trim()));
    db.agents.forEach((a) => {
      if (!ROOMS[a.room]) a.room = 'lounge';
      if (!STATUS[a.status]) a.status = 'waiting';
      if (LEGACY_AI[a.name]) a.name = LEGACY_AI[a.name];
      if (LEGACY_PERSON[a.owner]) a.owner = LEGACY_PERSON[a.owner];
      if (a.line === LEGACY_SEED_LINE) a.line = SEED_AGENT.line;
    });
    const meAgent = db.agents.find((a) => a.handle === SEED_AGENT.handle);
    if (meAgent && !meAgent.owner) meAgent.owner = SEED_AGENT.owner;
    if (!db.agents.length) db.agents = [seedAgent()];
    return db;
  }

  /* 브라우저에 저장된 예전 표기(승준님·피콜로)를 새 이름으로 맞춥니다. (한 번만 실행) */
  function migrateNames() {
    const NAMES_FLAG_KEY = 'pickleOffice.names.v1';
    if (readJSON(NAMES_FLAG_KEY, false)) return;
    const fixAgent = (a) => {
      if (!a) return;
      if (LEGACY_AI[a.name]) a.name = LEGACY_AI[a.name];
      if (LEGACY_PERSON[a.owner]) a.owner = LEGACY_PERSON[a.owner];
      if (a.line === LEGACY_SEED_LINE) a.line = SEED_AGENT.line;
    };
    if (me) {
      const next = { ...me };
      fixAgent(next);
      if (next.name !== me.name || next.owner !== me.owner || next.line !== me.line) {
        me = next;
        writeJSON(ME_KEY, me);
      }
    }
    const db = readJSON(LOCAL_KEY, null);
    if (db && Array.isArray(db.agents)) {
      db.agents.forEach(fixAgent);
      (db.messages || []).forEach((m) => {
        if (m.handle === SEED_AGENT.handle && LEGACY_AI[m.author]) m.author = LEGACY_AI[m.author];
      });
      (db.tasks || []).forEach((t) => {
        if (LEGACY_AI[t.assignee]) t.assignee = LEGACY_AI[t.assignee];
      });
      writeJSON(LOCAL_KEY, db);
    }
    writeJSON(NAMES_FLAG_KEY, true);
  }

  function localDB() {
    let db = readJSON(LOCAL_KEY, null);
    if (!readJSON(SEED_FLAG_KEY, false)) {
      db = tidyDB(db);
      writeJSON(LOCAL_KEY, db);
      writeJSON(SEED_FLAG_KEY, true);
      return db;
    }
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
      ? `Thomas, 비서 ${n}명이 ${rooms.size}개 방에서 일하고 있어요`
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
              <p class="msg-text">${linkify(esc(m.body))}</p>
            </div>
          </article>`;
      }).join('')
      : '<div class="empty">아직 회의 기록이 없어요. 첫 안건을 남겨 보세요.</div>';

    const av = $('#meetAvatar');
    av.textContent = me ? me.emoji : '🐣';
    $('#meetAs').textContent = me ? `${me.name}${roJosa(me.name)} 남기기` : '비서를 먼저 등록해 주세요';
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
          <p>${linkify(esc(m.body))}</p>
          <footer>${esc(m.author)} · ${timeAgo(m.createdAt)}</footer>
        </article>`).join('')
      : '<div class="empty">메모가 아직 없어요. 위에서 첫 메모를 붙여 보세요.</div>';

    const av = $('#memoAvatar');
    av.textContent = me ? me.emoji : '🐣';
    $('#memoAs').textContent = me ? `${me.name}${roJosa(me.name)} 붙이기` : '비서를 먼저 등록해 주세요';
  }

  function render() {
    renderTop();
    renderMap();
    renderMeeting();
    renderTasks();
    renderDocs();
    renderAgents();
    renderMemos();
  }

  /* ---------- 자료실 ---------- */
  function renderDocs() {
    const box = $('#docGrid');
    if (!box) return;
    const list = Array.isArray(docsBoard.docs) ? docsBoard.docs : [];
    const chips = $('#docChips');
    if (chips) {
      chips.innerHTML = `<span class="chip">📎 문서 <b>${list.length}</b>개</span>` +
        (docsBoard.updated ? `<span class="chip">🗓️ 최근 갱신 <b>${esc(docsBoard.updated)}</b></span>` : '');
    }
    box.innerHTML = list.length
      ? list.map((d) => `
        <article class="doc">
          <div class="doc-head">
            <span class="doc-icon" aria-hidden="true">${esc(d.icon || '📄')}</span>
            <div class="doc-title">
              ${d.tag ? `<span class="tag">${esc(d.tag)}</span>` : ''}
              <b>${esc(d.title || '')}</b>
              <span class="doc-meta">${esc(d.meta || '')}</span>
            </div>
          </div>
          ${d.desc ? `<p class="doc-desc">${esc(d.desc)}</p>` : ''}
          <div class="doc-actions">
            <a class="btn ghost doc-dl" href="${esc(d.file)}" download="${esc(d.name || '')}">⬇ 내려받기</a>
            <a class="link" href="${esc(d.file)}" target="_blank" rel="noopener">새 창에서 열기</a>
          </div>
        </article>`).join('')
      : '<div class="empty">아직 올린 자료가 없어요. docs/ 폴더에 파일을 넣고 data/documents.json에 적으면 여기에 나옵니다.</div>';
  }

  async function loadDocs() {
    try {
      const res = await fetch(DOCS_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && Array.isArray(data.docs)) docsBoard = data;
    } catch (e) {
      console.warn('[documents] 기본 목록으로 표시합니다', e);
      docsBoard = DOCS_BASE;
    }
    renderDocs();
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

  /* ---------- 투자연구소 보드 ---------- */
  function mergeBoard(base, data) {
    if (!data || typeof data !== 'object') return base;
    const out = { ...base, ...data };
    out.events = { ...base.events, ...(data.events || {}) };
    if (!Array.isArray(out.events.items)) out.events.items = base.events.items;
    out.draws = { ...base.draws, ...(data.draws || {}) };
    if (!Array.isArray(out.draws.items)) out.draws.items = base.draws.items;
    return out;
  }

  async function loadInvestBoard() {
    try {
      const res = await fetch(INVEST_BOARD_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      investBoard = mergeBoard(INVEST_BOARD_BASE, await res.json());
      boardFetched = true;
    } catch (e) {
      console.warn('[invest-board] 기본값으로 표시합니다', e);
      investBoard = INVEST_BOARD_BASE;
    }
    if (openRoomKey === 'invest') openRoom('invest');
  }

  function ballClass(n) {
    const v = Number(n);
    if (v <= 10) return 'b-y';
    if (v <= 20) return 'b-b';
    if (v <= 30) return 'b-r';
    if (v <= 40) return 'b-g';
    return 'b-e';
  }

  function rankPill(rank, extra) {
    if (!rank) return '';
    const win = rank !== '낙첨';
    return `<span class="play-result ${win ? 'win' : 'miss'}">${esc(rank)}${extra ? ` · ${esc(extra)}` : ''}</span>`;
  }

  function lottoResult(play, draw) {
    if (!draw || !Array.isArray(draw.winning) || draw.winning.length < 6) return null;
    const win = draw.winning.map(Number);
    const mine = (play.numbers || []).map(Number);
    const hits = mine.filter((n) => win.includes(n));
    const bonus = Number(draw.bonus || 0);
    const n = hits.length;
    let rank = '낙첨';
    if (n === 6) rank = '1등';
    else if (n === 5 && bonus && mine.includes(bonus)) rank = '2등';
    else if (n === 5) rank = '3등';
    else if (n === 4) rank = '4등';
    else if (n === 3) rank = '5등';
    return { hits, rank };
  }

  function pensionResult(play, draw) {
    if (!draw || draw.winning == null || draw.winning === '') return null;
    const w = String(draw.winning).replace(/\D/g, '').padStart(6, '0');
    const mine = String(play.digits || '').replace(/\D/g, '').padStart(6, '0');
    let tail = 0;
    for (let i = 5; i >= 0; i -= 1) {
      if (mine[i] === w[i]) tail += 1; else break;
    }
    const sameGroup = draw.winningGroup != null && Number(draw.winningGroup) === Number(play.group);
    let rank = '낙첨';
    if (tail === 6 && sameGroup) rank = '1등';
    else if (tail === 6) rank = '2등';
    else if (tail === 5) rank = '3등';
    else if (tail === 4) rank = '4등';
    else if (tail === 3) rank = '5등';
    return { rank, tail };
  }

  function drawPlayRow(play, draw) {
    if (Array.isArray(play.numbers)) {
      const r = lottoResult(play, draw);
      const balls = play.numbers.map((n) => {
        const hit = r && r.hits.includes(Number(n));
        return `<i class="ball ${ballClass(n)}${hit ? ' hit' : ''}">${esc(n)}</i>`;
      }).join('');
      return `<li><span class="play-label">${esc(play.label || '')}</span><span class="ball-row">${balls}</span>${r ? rankPill(r.rank, `${r.hits.length}개`) : ''}</li>`;
    }
    const digits = String(play.digits || '').replace(/\D/g, '').padStart(6, '0');
    const r = pensionResult(play, draw);
    const chars = digits.split('').map((c, i) => {
      const hit = r && i >= 6 - r.tail;
      const gap = i === 3 ? ' style="margin-left:4px"' : '';
      return `<span class="${hit ? 'pd-hit' : ''}"${gap}>${esc(c)}</span>`;
    }).join('');
    return `<li><span class="play-label">${esc(play.label || '')}</span><span class="pension"><span class="pgroup">${esc(play.group)}조</span><span class="pdigit">${chars}</span></span>${r ? rankPill(r.rank) : ''}</li>`;
  }

  function drawBlockHTML(d) {
    const winning = Array.isArray(d.winning) && d.winning.length
      ? `<p class="draw-win"><span class="draw-win-label">당첨</span>${d.winning.map((n) => `<i class="ball ${ballClass(n)} sm">${esc(n)}</i>`).join('')}${d.bonus ? `<span class="draw-bonus">+${esc(d.bonus)}</span>` : ''}</p>`
      : (d.winning ? `<p class="draw-win"><span class="draw-win-label">당첨</span><span class="pension"><span class="pgroup">${esc(d.winningGroup)}조</span><span class="pdigit">${esc(String(d.winning).replace(/(\d{3})(\d{3})/, '$1 $2'))}</span></span></p>` : '');

    return `
      <div class="draw-block">
        <div class="draw-top">
          <b>${esc(d.game || '')} ${esc(d.round || '')}</b>
          <span class="draw-status">${esc(d.status || '추첨 대기')}</span>
        </div>
        <p class="draw-when">🗓 ${esc(d.drawLabel || '')}</p>
        ${winning}
        <ol class="play-list">${(d.plays || []).map((p) => drawPlayRow(p, d)).join('')}</ol>
        ${d.note ? `<p class="draw-note">📌 ${esc(d.note)}</p>` : ''}
        <p class="draw-compare">🔎 ${esc(d.compareNote || (d.winning ? '비교 완료' : '추첨 대기'))}</p>
      </div>`;
  }

  function chalkDoodleHTML() {
    return `
      <svg class="chalk-chart" viewBox="0 0 200 92" role="img" aria-label="칠판에 그린 상승 차트">
        <line x1="6" y1="82" x2="194" y2="82" stroke="rgba(255,255,255,.22)" stroke-width="1.4" stroke-dasharray="4 5" />
        <rect x="14" y="62" width="13" height="19" fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.34)" stroke-width="1.4" rx="2" />
        <rect x="35" y="54" width="13" height="27" fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.34)" stroke-width="1.4" rx="2" />
        <rect x="56" y="64" width="13" height="17" fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.34)" stroke-width="1.4" rx="2" />
        <rect x="77" y="46" width="13" height="35" fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.34)" stroke-width="1.4" rx="2" />
        <polyline points="18,68 42,58 66,56 92,44 118,38 146,24 176,14" fill="none" stroke="rgba(255,253,220,.88)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M168 12 L177 14 L176 23" fill="none" stroke="rgba(255,253,220,.88)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="92" cy="44" r="2.6" fill="rgba(255,253,220,.9)" />
        <circle cx="146" cy="24" r="2.6" fill="rgba(255,253,220,.9)" />
      </svg>
      <p class="chalk-sign">응모 → 기록 → 비교 ✍️</p>`;
  }

  function investBoardHTML() {
    const b = investBoard || INVEST_BOARD_BASE;
    const ev = b.events || {};
    const items = Array.isArray(ev.items) ? ev.items : [];
    const draws = b.draws || {};
    const list = Array.isArray(draws.items) ? draws.items : [];

    const rows = items.map((it) => `
      <li class="chalk-row${it.tone === 'watch' ? ' watch' : ' done'}">
        <span class="chalk-box" aria-hidden="true"></span>
        <span class="chalk-body">
          <span class="chalk-title">${esc(it.icon || '•')} ${esc(it.title || '')}</span>
          ${it.note ? `<span class="chalk-note">${esc(it.note)}</span>` : ''}
        </span>
        <span class="chalk-status">${esc(it.status || '')}</span>
      </li>`).join('');

    return `
      <div class="lab-grid">
        <section class="board board--chalk" aria-label="이벤트 응모 현황">
          <div class="board-head">
            <h4>✍️ ${esc(ev.title || '이벤트 응모 현황')}</h4>
            <span class="board-chip">${items.length}건</span>
          </div>
          <ul class="chalk-list">${rows || '<li class="chalk-row"><span class="chalk-box"></span><span class="chalk-body"><span class="chalk-title">아직 응모 기록이 없어요</span></span></li>'}</ul>
          ${chalkDoodleHTML()}
          ${ev.subtitle ? `<p class="board-foot chalk-foot">${esc(ev.subtitle)}</p>` : ''}
        </section>
        <section class="board board--status" aria-label="로또·연금복권 현황판">
          <div class="board-head">
            <h4>🎯 ${esc(draws.title || '로또·연금복권 예측 & 결과 비교')}</h4>
            <span class="board-chip soft">${list.length}건</span>
          </div>
          ${list.map(drawBlockHTML).join('') || '<p class="muted small">진행 중인 추첨이 없어요.</p>'}
          ${draws.subtitle ? `<p class="board-foot">${esc(draws.subtitle)}</p>` : ''}
        </section>
      </div>
      <p class="lab-note">${boardFetched ? 'data/invest-board.json 에서 불러왔어요' : '기본값으로 표시 중 — data/invest-board.json 을 읽지 못했어요'}</p>`;
  }

  function openRoom(key) {
    const room = ROOMS[key];
    if (!room) return;
    openRoomKey = key;
    const card = $('#roomModal .modal-card');
    if (card) card.classList.toggle('wide', key === 'invest');
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
      ${key === 'invest' ? investBoardHTML() : ''}
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
      const msg = mode === 'sb'
        ? '초대 링크를 복사했어요 — 동료 피클에게 보내 주세요'
        : '링크를 복사했어요. 지금은 브라우저 저장 모드라 기기마다 내용이 따로 담깁니다 — ⚙️ 실시간 DB 연결을 켜면 함께 맞춰져요';
      copyText(url, msg);
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
        toast(`${data.name}, ${ROOMS[data.room].name}에 들어왔어요.`);
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
      if (!confirm(`${me.name}(${me.handle})을(를) 연구소에서 삭제할까요?`)) return;
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

    migrateNames();
    await refresh();
    loadInvestBoard();
    loadDocs();

    const hash = (location.hash || '').replace('#', '');
    if (['map', 'meeting', 'tasks', 'docs', 'agents', 'memo'].includes(hash)) switchTab(hash);

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
