# Meon Hall Share (Vercel + Supabase)

## 1. Supabase
1. Buat project di supabase.com (gratis).
2. Menu **SQL Editor** > New query > tempel seluruh isi `supabase.sql` > **Run**.
3. Menu **Project Settings > API**, salin: Project URL, `anon public` key, dan `service_role` key (RAHASIA).

## 2. GitHub
Upload semua isi folder ini (tanpa `node_modules`) ke repository GitHub baru.

## 3. Vercel
1. vercel.com > Add New > Project > pilih repository tadi. Framework: **Other**. Build command & output dikosongkan.
2. Environment Variables (Settings):
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_KEY
   - JWT_SECRET (string acak panjang >= 32 karakter)
3. Klik Deploy. Buka web, daftar akun pertama = **Owner**.

## Lokal (opsional)
`npm i -g vercel`, salin `.env.example` ke `.env`, lalu `vercel dev`.

## Update dari versi sebelumnya
Jalankan berurutan di SQL Editor (lewati yang sudah pernah): `migration.sql`, `migration-v3.sql`, `migration-v4.sql`, `migration-v5.sql`. Lalu timpa seluruh folder `public/` dan `api/index.js`. Harga paket VIP diubah di bagian PACKAGES pada `api/index.js`.

## Catatan
- Service key hanya dipakai di server (`api/index.js`), jangan pernah dimasukkan ke `public/`.
- Semua tabel dikunci RLS; browser tidak bisa akses database langsung.
- Batas file 50 MB (paket gratis Supabase). Ubah di Storage > uploads bila perlu.
