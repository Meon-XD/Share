
-- Creator Workspace / collaboration
create table if not exists public.creator_projects (
  id text primary key,
  owner text not null references public.users(username) on delete cascade,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now())*1000)::bigint
);
create table if not exists public.creator_members (
  project_id text not null references public.creator_projects(id) on delete cascade,
  username text not null references public.users(username) on delete cascade,
  role text not null default 'editor',
  status text not null default 'active',
  invited_by text not null,
  created_at bigint not null default (extract(epoch from now())*1000)::bigint,
  primary key(project_id, username)
);
create index if not exists creator_members_user_idx on public.creator_members(username);
