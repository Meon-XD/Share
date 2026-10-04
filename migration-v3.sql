-- Migrasi v3: nama tampilan
alter table users add column if not exists display_name text not null default '';
