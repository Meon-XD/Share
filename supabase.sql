-- Meon Hall Share: jalankan seluruh isi file ini di Supabase > SQL Editor
create table users(
  username text primary key, hash text not null, role text not null default 'user',
  tag_text text not null default '', tag_color text not null default '#6d4aff',
  bio text not null default '', created_at timestamptz not null default now());
create table posts(
  id text primary key, title text not null, descr text not null default '',
  cat text not null default 'lain', thumb text not null default '',
  link text not null default '', file_url text not null default '',
  socials jsonb not null default '{}',
  author text not null references users(username) on delete cascade,
  ts bigint not null, views int not null default 0, dl int not null default 0,
  likes text[] not null default '{}');
create table comments(
  id text primary key, pid text not null references posts(id) on delete cascade,
  parent text not null default '', author text not null references users(username) on delete cascade,
  body text not null, ts bigint not null);
create table saves(username text primary key references users(username) on delete cascade, ids text[] not null default '{}');
create table presence(sid text primary key, t bigint not null);
create table stats(id int primary key, visits bigint not null default 0);
insert into stats values (1,0);

-- Kunci semua tabel: hanya server (service key) yang boleh akses
alter table users enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table saves enable row level security;
alter table presence enable row level security;
alter table stats enable row level security;

create function inc_views(pid text) returns void language sql as $$ update posts set views=views+1 where id=pid $$;
create function inc_dl(pid text) returns void language sql as $$ update posts set dl=dl+1 where id=pid $$;
create function inc_visits() returns void language sql as $$ update stats set visits=visits+1 where id=1 $$;
create function toggle_like(pid text, uname text) returns void language sql as $$
  update posts set likes = case when uname = any(likes) then array_remove(likes,uname) else array_append(likes,uname) end where id=pid $$;
revoke execute on function inc_views(text), inc_dl(text), inc_visits(), toggle_like(text,text) from public, anon, authenticated;

-- Bucket penyimpanan thumbnail & file (publik dibaca, maks 50 MB per file)
insert into storage.buckets (id,name,public,file_size_limit) values ('uploads','uploads',true,52428800) on conflict (id) do nothing;
