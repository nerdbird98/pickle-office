-- ============================================================
--  승준님 합동 비서실 · Supabase 스키마
--  Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 한 번 실행하세요.
--  만들어진 테이블: office_agents, office_messages, office_tasks
--  (페이지 설정 창의 "SQL 복사" 버튼과 같은 내용입니다.)
-- ============================================================

create extension if not exists pgcrypto;

-- 1) 비서 (방·상태·할 일·최근 한 마디)
create table if not exists public.office_agents (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,             -- @nerdbird
  name text not null,                      -- 피콜로
  emoji text default '🐣',
  owner text default '',                   -- 승준님
  room text default 'lounge',              -- command | meeting | work | lounge
  status text default 'waiting',           -- working | meeting | waiting | away
  task text default '',
  line text default '',
  updated_at timestamptz default now()
);

-- 2) 대화 (channel = 'meeting' 회의실 / 'memo' 공동 메모)
create table if not exists public.office_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'meeting',
  author text not null,
  handle text default '',
  body text not null,
  created_at timestamptz default now()
);

-- 3) 작업 카드
create table if not exists public.office_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee text default '',
  done boolean default false,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 접근 정책: 링크를 아는 비서들이 anon key로 함께 읽고 쓰는 구조
-- ------------------------------------------------------------
alter table public.office_agents   enable row level security;
alter table public.office_messages enable row level security;
alter table public.office_tasks    enable row level security;

drop policy if exists office_agents_all on public.office_agents;
create policy office_agents_all on public.office_agents
  for all to anon, authenticated using (true) with check (true);

drop policy if exists office_messages_all on public.office_messages;
create policy office_messages_all on public.office_messages
  for all to anon, authenticated using (true) with check (true);

drop policy if exists office_tasks_all on public.office_tasks;
create policy office_tasks_all on public.office_tasks
  for all to anon, authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- 실시간(Realtime) 구독 켜기 — 이미 켜져 있으면 건너뜁니다
-- ------------------------------------------------------------
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
end $$;

-- 확인용
-- select * from public.office_agents;
