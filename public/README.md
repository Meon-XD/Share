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

## Creator Studio

Meon Hall Share now includes a browser-based Minecraft Bedrock Creator Studio. Logged-in creators can choose **Texture Pack** or **Addon**, enter project metadata, generate UUIDs, upload/rename/move files into pack folders, create custom folders, add basic custom items/blocks, preview manifests, and export `.mcpack` or `.mcaddon` directly from the browser.

The creator uses Bedrock manifest format 2 and generates unique header/module UUIDs. Addon exports contain linked Resource Pack and Behavior Pack manifests.

## Creator Studio PRO v2

Meon Hall Share includes a browser-based Bedrock Creator Studio for logged-in creators.

- Texture Pack wizard with automatic folders and manifest UUIDs.
- Addon wizard with linked Resource Pack + Behavior Pack manifests.
- Item builder: basic/weapon/tool/food/armor, stack size, damage, durability and hand-equipped settings.
- Block builder: hardness, friction, light emission and transparency.
- Recipe builder: shaped/shapeless starter recipes.
- Entity builder: health, movement speed, spawn/summon settings, client entity and starter geometry.
- File upload, rename and folder routing.
- Local project save/load using browser storage.
- Pre-export validator for project metadata, duplicate IDs, paths and oversized files.
- Export to `.mcpack` or `.mcaddon` directly in the browser.

Generated packs should still be tested in a clean Minecraft Bedrock world because custom content can depend on the exact game version and API/component availability.
