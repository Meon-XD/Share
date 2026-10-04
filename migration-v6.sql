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
