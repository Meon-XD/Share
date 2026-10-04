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
