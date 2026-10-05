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

-- Migrasi v2: jalankan di Supabase > SQL Editor (aman dijalankan ulang)
alter table users add column if not exists avatar text not null default '';
alter table users add column if not exists vip_until bigint not null default 0;
alter table users add column if not exists banned_until bigint not null default 0;
alter table posts add column if not exists vip boolean not null default false;
alter table posts add column if not exists hidden boolean not null default false;

-- Migrasi v3: nama tampilan
alter table users add column if not exists display_name text not null default '';
-- Migrasi v4: follow, chat, notifikasi, laporan, tag, versi game, pin
create table if not exists follows(
  follower text not null references users(username) on delete cascade,
  followee text not null references users(username) on delete cascade,
  primary key(follower, followee));
create table if not exists messages(
  id bigserial primary key,
  from_u text not null references users(username) on delete cascade,
  to_u text not null references users(username) on delete cascade,
  body text not null, ts bigint not null, read boolean not null default false);
create index if not exists messages_to on messages(to_u, read);
create index if not exists messages_from on messages(from_u);
create table if not exists notifs(
  id bigserial primary key,
  to_u text not null references users(username) on delete cascade,
  kind text not null, actor text not null, pid text not null default '',
  ts bigint not null, read boolean not null default false);
create index if not exists notifs_to on notifs(to_u, ts desc);
create table if not exists reports(
  id bigserial primary key, pid text not null default '', cid text not null default '',
  reporter text not null, reason text not null default '', ts bigint not null,
  status text not null default 'open');
alter table follows enable row level security;
alter table messages enable row level security;
alter table notifs enable row level security;
alter table reports enable row level security;
alter table posts add column if not exists tags text[] not null default '{}';
alter table posts add column if not exists gver text not null default '';
alter table posts add column if not exists pinned boolean not null default false;
-- Migrasi v5: saldo, top up, paket VIP, bayar otomatis
alter table users add column if not exists balance bigint not null default 0;
alter table users add column if not exists auto_renew boolean not null default false;
alter table users add column if not exists auto_pkg text not null default '';
create table if not exists topups(
  id bigserial primary key,
  username text not null references users(username) on delete cascade,
  claimed bigint not null, final bigint not null default 0,
  proof_path text not null default '', status text not null default 'pending',
  ts bigint not null, reviewed_by text not null default '', reviewed_ts bigint not null default 0);
create table if not exists txns(
  id bigserial primary key,
  username text not null references users(username) on delete cascade,
  kind text not null, amount bigint not null, note text not null default '', ts bigint not null);
create index if not exists txns_u on txns(username, ts desc);
create index if not exists topups_s on topups(status, ts);
alter table topups enable row level security;
alter table txns enable row level security;

create or replace function add_balance(uname text, amt bigint) returns bigint language plpgsql as $$
declare nb bigint;
begin
  update users set balance = balance + amt where username = uname returning balance into nb;
  return nb;
end $$;
create or replace function spend_balance(uname text, amt bigint) returns bigint language plpgsql as $$
declare nb bigint;
begin
  update users set balance = balance - amt where username = uname and balance >= amt returning balance into nb;
  if nb is null then return -1; end if;
  return nb;
end $$;
revoke execute on function add_balance(text,bigint), spend_balance(text,bigint) from public, anon, authenticated;

-- Bucket PRIVAT untuk bukti pembayaran (hanya server yang bisa membaca)
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('proofs','proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
