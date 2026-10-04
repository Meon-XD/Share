-- Migrasi v2: jalankan di Supabase > SQL Editor (aman dijalankan ulang)
alter table users add column if not exists avatar text not null default '';
alter table users add column if not exists vip_until bigint not null default 0;
alter table users add column if not exists banned_until bigint not null default 0;
alter table posts add column if not exists vip boolean not null default false;
alter table posts add column if not exists hidden boolean not null default false;
