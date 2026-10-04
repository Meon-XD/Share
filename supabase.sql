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


-- Migrasi v6: reward like + anti-spam view/download + penarikan saldo
-- Jalankan setelah migration-v5.sql

create table if not exists post_events(
  pid text not null references posts(id) on delete cascade,
  visitor_key text not null,
  event_kind text not null check (event_kind in ('view','download')),
  ts bigint not null default 0,
  primary key(pid, visitor_key, event_kind)
);
create index if not exists post_events_kind on post_events(event_kind, ts desc);
alter table post_events enable row level security;

create table if not exists like_rewards(
  pid text not null references posts(id) on delete cascade,
  milestone bigint not null,
  username text not null references users(username) on delete cascade,
  amount bigint not null default 10,
  ts bigint not null,
  primary key(pid, milestone)
);
create index if not exists like_rewards_user on like_rewards(username, ts desc);
alter table like_rewards enable row level security;

create table if not exists withdrawals(
  id bigserial primary key,
  username text not null references users(username) on delete cascade,
  amount bigint not null check(amount > 0),
  method text not null check(method in ('gopay','dana','shopeepay','qris','bank')),
  target text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  admin_note text not null default '',
  reviewed_by text not null default '',
  ts bigint not null,
  reviewed_ts bigint not null default 0
);
create index if not exists withdrawals_user on withdrawals(username, ts desc);
create index if not exists withdrawals_pending on withdrawals(status, ts desc);
alter table withdrawals enable row level security;

create or replace function create_withdrawal(uname text, amount_in bigint, method_in text, target_in text)
returns jsonb language plpgsql security definer as $$
declare nb bigint; wid bigint;
begin
  if amount_in < 1000 then raise exception 'Minimal penarikan Rp1.000'; end if;
  if method_in not in ('gopay','dana','shopeepay','qris','bank') then raise exception 'Metode penarikan tidak valid'; end if;
  if length(trim(target_in)) < 3 then raise exception 'Tujuan penarikan tidak valid'; end if;
  if exists(select 1 from withdrawals where username=uname and status='pending') then raise exception 'Masih ada penarikan yang sedang diperiksa admin'; end if;
  update users set balance=balance-amount_in where username=uname and balance>=amount_in returning balance into nb;
  if nb is null then raise exception 'Saldo tidak cukup'; end if;
  insert into withdrawals(username,amount,method,target,status,ts)
  values(uname,amount_in,method_in,left(trim(target_in),100),'pending',extract(epoch from now())::bigint*1000)
  returning id into wid;
  insert into txns(username,kind,amount,note,ts)
  values(uname,'withdraw_hold',-amount_in,'Penarikan ditahan, menunggu pemeriksaan admin',extract(epoch from now())::bigint*1000);
  return jsonb_build_object('id',wid,'balance',nb);
end $$;
revoke execute on function create_withdrawal(text,bigint,text,text) from public, anon, authenticated;

-- Catat view/download hanya sekali untuk satu pengguna/browser pada satu project.
create or replace function track_post_event(pid text, visitor_key text, event_kind text)
returns boolean language plpgsql security definer as $$
declare inserted boolean;
begin
  insert into post_events(pid, visitor_key, event_kind, ts)
  values(pid, visitor_key, event_kind, extract(epoch from now())::bigint * 1000)
  on conflict (pid, visitor_key, event_kind) do nothing;
  inserted := found;
  if inserted and event_kind = 'view' then
    update posts set views = views + 1 where id = pid;
  elsif inserted and event_kind = 'download' then
    update posts set dl = dl + 1 where id = pid;
  end if;
  return inserted;
end $$;

-- Like + reward dibuat atomik.
-- Setiap project mendapat Rp10 sekali ketika mencapai setiap kelipatan 100 like.
create or replace function toggle_like_reward(pid text, uname text)
returns jsonb language plpgsql security definer as $$
declare
  liked boolean;
  n bigint;
  milestone bigint;
  reward bigint := 0;
  author_name text;
  inserted_reward boolean := false;
begin
  select author into author_name from posts where id = pid for update;
  if author_name is null then raise exception 'Info tidak ditemukan'; end if;

  select (uname = any(likes)) into liked from posts where id = pid;
  if liked then
    update posts set likes = array_remove(likes, uname) where id = pid;
    return jsonb_build_object('liked', false, 'reward', 0);
  end if;

  update posts set likes = array_append(likes, uname) where id = pid returning cardinality(likes) into n;

  if n >= 100 then
    milestone := floor(n / 100);
    insert into like_rewards(pid, milestone, username, amount, ts)
    values(pid, milestone, author_name, 10, extract(epoch from now())::bigint * 1000)
    on conflict (pid, milestone) do nothing;
    inserted_reward := found;
    if inserted_reward then
      update users set balance = balance + 10 where username = author_name;
      insert into txns(username, kind, amount, note, ts)
      values(author_name, 'like_reward', 10, 'Reward ' || (milestone * 100) || ' like pada project', extract(epoch from now())::bigint * 1000);
      reward := 10;
    end if;
  end if;

  return jsonb_build_object('liked', true, 'reward', reward);
end $$;

revoke execute on function track_post_event(text,text,text), toggle_like_reward(text,text) from public, anon, authenticated;
