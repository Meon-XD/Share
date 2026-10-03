const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const SEC = process.env.JWT_SECRET;
const CATS = ['addon', 'texture', 'survival', 'world', 'client', 'file', 'hadiah', 'lain'];
const SOC = ['yt', 'tt', 'ig', 'dc', 'fb', 'x'];
const url = v => (/^https?:\/\//i.test(String(v || '').trim()) ? String(v).trim().slice(0, 1000) : '');
const rid = () => Date.now() + Math.random().toString(36).slice(2, 6);

class Err extends Error { constructor(m, c = 400) { super(m); this.c = c; } }
const ok = (c, m, code) => { if (!c) throw new Err(m, code); };

function who(req) {
  const m = (req.headers.cookie || '').match(/(?:^|; )mhs=([^;]+)/);
  if (!m) return null;
  try { return jwt.verify(m[1], SEC).u; } catch { return null; }
}
function cookie(res, tok, age) {
  res.setHeader('Set-Cookie', `mhs=${tok}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`);
}
const q = async p => { const { data, error } = await p; if (error) throw error; return data; };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = req.body || {};
    let me = null;
    const u0 = who(req);
    if (u0) me = await q(sb.from('users').select('username,role').eq('username', u0).maybeSingle());
    const need = () => ok(me, 'Masuk dulu', 401);
    const adm = () => me && ['owner', 'admin'].includes(me.role);
    let out = { ok: true };

    switch (b.action) {
      case 'state': {
        const [us, ps, cs, sv, pr, st] = await Promise.all([
          q(sb.from('users').select('username,role,tag_text,tag_color,bio,created_at')),
          q(sb.from('posts').select('*').order('ts', { ascending: false }).limit(300)),
          q(sb.from('comments').select('*').order('ts').limit(3000)),
          me ? q(sb.from('saves').select('ids').eq('username', me.username).maybeSingle()) : null,
          sb.from('presence').select('sid', { count: 'exact', head: true }).gt('t', Date.now() - 75000),
          q(sb.from('stats').select('visits').eq('id', 1).maybeSingle()),
        ]);
        const users = {};
        us.forEach(x => users[x.username] = { role: x.role, tagText: x.tag_text, tagColor: x.tag_color, bio: x.bio, created: new Date(x.created_at).getTime() });
        const posts = ps.map(p => {
          const o = { id: p.id, title: p.title, desc: p.descr, cat: p.cat, thumb: p.thumb, link: p.link, fileUrl: p.file_url, author: p.author, ts: p.ts, views: p.views, dl: p.dl, likes: p.likes };
          SOC.forEach(k => o['s_' + k] = (p.socials || {})[k] || '');
          return o;
        });
        const comments = cs.map(c => ({ id: c.id, pid: c.pid, parent: c.parent, author: c.author, text: c.body, ts: c.ts }));
        out = { me: me ? me.username : null, users, posts, comments, saves: sv ? sv.ids : [], peers: pr.count || 0, visits: st ? Number(st.visits) : 0 };
        break;
      }
      case 'config':
        out = { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY };
        break;
      case 'beat':
        await q(sb.from('presence').upsert({ sid: String(b.sid || '').slice(0, 40), t: Date.now() }));
        if (Math.random() < 0.1) await sb.from('presence').delete().lt('t', Date.now() - 600000);
        break;
      case 'visit':
        await sb.rpc('inc_visits');
        break;
      case 'signup': {
        const u = String(b.u || '').trim().toLowerCase(), p = String(b.p || '');
        ok(/^[a-z0-9_]{3,20}$/.test(u), 'Username 3-20 karakter: huruf kecil, angka, _');
        ok(p.length >= 6 && p.length <= 100, 'Password minimal 6 karakter');
        const ex = await q(sb.from('users').select('username').eq('username', u).maybeSingle());
        ok(!ex, 'Username sudah dipakai');
        const { count } = await sb.from('users').select('username', { count: 'exact', head: true });
        const { error } = await sb.from('users').insert({ username: u, hash: await bcrypt.hash(p, 10), role: count === 0 ? 'owner' : 'user' });
        ok(!error, 'Username sudah dipakai');
        cookie(res, jwt.sign({ u }, SEC, { expiresIn: '30d' }), 2592000);
        break;
      }
      case 'signin': {
        const u = String(b.u || '').trim().toLowerCase();
        const x = await q(sb.from('users').select('username,hash').eq('username', u).maybeSingle());
        ok(x && await bcrypt.compare(String(b.p || ''), x.hash), 'Username atau password salah', 401);
        cookie(res, jwt.sign({ u }, SEC, { expiresIn: '30d' }), 2592000);
        break;
      }
      case 'signout':
        cookie(res, '', 0);
        break;
      case 'view':
        await sb.rpc('inc_views', { pid: String(b.id) });
        break;
      case 'dl':
        need();
        await sb.rpc('inc_dl', { pid: String(b.id) });
        break;
      case 'like':
        need();
        await sb.rpc('toggle_like', { pid: String(b.id), uname: me.username });
        break;
      case 'save': {
        need();
        const s = await q(sb.from('saves').select('ids').eq('username', me.username).maybeSingle());
        const ids = s ? s.ids : [], id = String(b.id);
        await q(sb.from('saves').upsert({ username: me.username, ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] }));
        break;
      }
      case 'comment': {
        need();
        const text = String(b.text || '').trim().slice(0, 1000);
        ok(text, 'Komentar kosong');
        let parent = '';
        if (b.reply) {
          const r = await q(sb.from('comments').select('id,parent,pid').eq('id', String(b.reply)).maybeSingle());
          ok(r && r.pid === b.pid, 'Komentar tujuan tidak ada');
          parent = r.parent || r.id;
        }
        await q(sb.from('comments').insert({ id: 'c' + rid(), pid: String(b.pid), parent, author: me.username, body: text, ts: Date.now() }));
        break;
      }
      case 'delc': {
        need();
        const c = await q(sb.from('comments').select('author').eq('id', String(b.id)).maybeSingle());
        ok(c && (c.author === me.username || adm()), 'Tidak diizinkan', 403);
        await q(sb.from('comments').delete().or(`id.eq.${b.id},parent.eq.${b.id}`));
        break;
      }
      case 'savepost': {
        need();
        const title = String(b.title || '').trim().slice(0, 100);
        ok(title, 'Judul wajib diisi');
        const link = url(b.link), fileUrl = url(b.fileUrl);
        ok(link || fileUrl, 'Isi link atau upload file');
        const socials = {};
        SOC.forEach(k => socials[k] = url(b['s_' + k]));
        const row = { title, descr: String(b.desc || '').slice(0, 2000), cat: CATS.includes(b.cat) ? b.cat : 'lain', thumb: url(b.thumb), link, file_url: fileUrl, socials };
        if (b.id) {
          const p = await q(sb.from('posts').select('author').eq('id', String(b.id)).maybeSingle());
          ok(p && (p.author === me.username || adm()), 'Tidak diizinkan', 403);
          await q(sb.from('posts').update(row).eq('id', String(b.id)));
        } else {
          await q(sb.from('posts').insert({ ...row, id: 'p' + rid(), author: me.username, ts: Date.now() }));
        }
        break;
      }
      case 'delpost': {
        need();
        const p = await q(sb.from('posts').select('author').eq('id', String(b.id)).maybeSingle());
        ok(p && (p.author === me.username || adm()), 'Tidak diizinkan', 403);
        await q(sb.from('posts').delete().eq('id', String(b.id)));
        break;
      }
      case 'savetag': {
        need(); ok(adm(), 'Hanya admin', 403);
        const row = { tag_text: String(b.tagText || '').slice(0, 20), tag_color: /^#[0-9a-f]{6}$/i.test(b.tagColor) ? b.tagColor : '#6d4aff' };
        if (b.role && me.role === 'owner' && b.u !== me.username && ['user', 'admin', 'owner'].includes(b.role)) row.role = b.role;
        await q(sb.from('users').update(row).eq('username', String(b.u)));
        break;
      }
      case 'savebio':
        need();
        await q(sb.from('users').update({ bio: String(b.bio || '').slice(0, 300) }).eq('username', me.username));
        break;
      case 'chpw': {
        need();
        const x = await q(sb.from('users').select('hash').eq('username', me.username).maybeSingle());
        ok(await bcrypt.compare(String(b.old || ''), x.hash), 'Password lama salah');
        ok(String(b.new || '').length >= 6, 'Password baru minimal 6 karakter');
        await q(sb.from('users').update({ hash: await bcrypt.hash(String(b.new), 10) }).eq('username', me.username));
        break;
      }
      case 'signupload': {
        need();
        const ext = (String(b.name || '').split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
        const path = `${b.kind === 'thumb' ? 'thumb' : 'file'}/${me.username}/${rid()}.${ext}`;
        const { data, error } = await sb.storage.from('uploads').createSignedUploadUrl(path);
        if (error) throw error;
        out = { path, token: data.token, url: sb.storage.from('uploads').getPublicUrl(path).data.publicUrl };
        break;
      }
      default:
        throw new Err('Aksi tidak dikenal');
    }
    res.status(200).json(out);
  } catch (e) {
    if (!e.c) console.error(e);
    res.status(e.c || 500).json({ error: e.c ? e.message : 'Server error' });
  }
};
