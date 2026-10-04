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
