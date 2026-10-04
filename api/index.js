const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const SEC = process.env.JWT_SECRET;
const CATS = ['addon', 'texture', 'survival', 'world', 'client', 'file', 'hadiah', 'lain'];
const SOC = ['yt', 'tt', 'ig', 'dc', 'fb', 'x'];
const url = v => (/^https?:\/\//i.test(String(v || '').trim()) ? String(v).trim().slice(0, 1000) : '');
const FOREVER = 8e15;
// ===== Paket VIP (ubah harga/durasi di sini) =====
const PACKAGES = [
  { id: 'v1', label: 'VIP 1 Hari', days: 1, price: 2000 },
  { id: 'v7', label: 'VIP 1 Minggu', days: 7, price: 10000 },
  { id: 'v30', label: 'VIP 1 Bulan', days: 30, price: 30000 },
  { id: 'v90', label: 'VIP 3 Bulan', days: 90, price: 75000 },
  { id: 'v365', label: 'VIP 1 Tahun', days: 365, price: 250000 },
];
async function buyPkg(uname, pkg) {
  const { data, error } = await sb.rpc('spend_balance', { uname, amt: pkg.price });
  if (error) throw error;
  if (Number(data) < 0) return false;
  const u = await sb.from('users').select('vip_until').eq('username', uname).maybeSingle();
  const cur = (u.data && u.data.vip_until) || 0;
  const nu = cur >= FOREVER ? FOREVER : Math.max(Date.now(), cur) + pkg.days * 864e5;
  await sb.from('users').update({ vip_until: nu }).eq('username', uname);
  await sb.from('txns').insert({ username: uname, kind: 'vip', amount: -pkg.price, note: pkg.label, ts: Date.now() });
  return true;
}
const RESERVED = /^(owner|admin|administrator|pemilik)$/i;
const norm = v => String(v || '').normalize('NFKC').replace(/[\s\u200b-\u200f\u2060\ufeff]/g, '');
const parseTags = v => [...new Set(String(v || '').toLowerCase().split(/[\s,#]+/).filter(t => /^[a-z0-9._-]{1,20}$/.test(t)))].slice(0, 5);
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
function getCookie(req, name) { const m = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${name}=([^;]+)`)); return m ? decodeURIComponent(m[1]) : ''; }
function visitorKey(req, res, me) {
  if (me) return `u:${me.username}`;
  let v = getCookie(req, 'mhv');
  if (!/^[a-f0-9-]{20,80}$/.test(v)) { v = crypto.randomUUID(); res.setHeader('Set-Cookie', `mhv=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`); }
  return `g:${v}`;
}
const q = async p => { const { data, error } = await p; if (error) throw error; return data; };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = req.body || {};
    let me = null;
    const u0 = who(req);
    if (u0) me = await q(sb.from('users').select('username,role,vip_until,banned_until,balance,auto_renew,auto_pkg').eq('username', u0).maybeSingle());
    const need = () => {
      ok(me, 'Masuk dulu', 401);
      if (me.banned_until > Date.now()) throw new Err(me.banned_until >= FOREVER ? 'Akun diblokir permanen' : 'Akun diblokir sampai ' + new Date(me.banned_until).toLocaleString('id-ID'), 403);
    };
    const adm = () => me && ['owner', 'admin'].includes(me.role);
    const notify = async (to, kind, pid = '') => { if (to && me && to !== me.username) await sb.from('notifs').insert({ to_u: to, kind, actor: me.username, pid: String(pid), ts: Date.now() }); };
    const canVip = p => adm() || (me && (me.vip_until > Date.now() || p.author === me.username));
    let out = { ok: true };
    const vkey = visitorKey(req, res, me);

    switch (b.action) {
      case 'state': {
        // Perpanjang VIP otomatis (hanya jika diaktifkan, VIP pernah ada & sudah berakhir)
        if (me && me.auto_renew && me.auto_pkg && me.vip_until > 0 && me.vip_until < Date.now()) {
          const pkg = PACKAGES.find(p => p.id === me.auto_pkg);
          const done = pkg ? await buyPkg(me.username, pkg) : false;
          if (!done) await sb.from('users').update({ auto_renew: false }).eq('username', me.username);
          await sb.from('notifs').insert({ to_u: me.username, kind: done ? 'vipok' : 'autofail', actor: me.username, pid: '', ts: Date.now() });
          me = await q(sb.from('users').select('username,role,vip_until,banned_until,balance,auto_renew,auto_pkg').eq('username', me.username).maybeSingle());
        }
        const [us, ps, cs, sv, pr, st] = await Promise.all([
          q(sb.from('users').select('username,role,tag_text,tag_color,bio,display_name,avatar,vip_until,banned_until,created_at')),
          q(sb.from('posts').select('*').order('ts', { ascending: false }).limit(300)),
          q(sb.from('comments').select('*').order('ts').limit(3000)),
          me ? q(sb.from('saves').select('ids').eq('username', me.username).maybeSingle()) : null,
          sb.from('presence').select('sid', { count: 'exact', head: true }).gt('t', Date.now() - 75000),
          q(sb.from('stats').select('visits').eq('id', 1).maybeSingle()),
        ]);
        const users = {};
        us.forEach(x => users[x.username] = { role: x.role, tagText: x.tag_text, tagColor: x.tag_color, bio: x.bio, display: x.display_name, avatar: x.avatar, vipUntil: x.vip_until, bannedUntil: x.banned_until, created: new Date(x.created_at).getTime() });
        const posts = ps.filter(p => !p.hidden || adm() || (me && p.author === me.username)).map(p => {
          const locked = p.vip && !canVip(p);
          const o = { vip: p.vip, hidden: p.hidden, locked, tags: p.tags || [], gver: p.gver || '', pinned: !!p.pinned, id: p.id, title: p.title, desc: locked ? '' : p.descr, cat: p.cat, thumb: p.thumb, link: locked ? '' : p.link, fileUrl: locked ? '' : p.file_url, author: p.author, ts: p.ts, views: p.views, dl: p.dl, likes: p.likes };
          SOC.forEach(k => o['s_' + k] = locked ? '' : ((p.socials || {})[k] || ''));
          return o;
        });
        const lockedIds = new Set(ps.filter(p => p.vip && !canVip(p)).map(p => p.id));
        const comments = cs.filter(c => !lockedIds.has(c.pid)).map(c => ({ id: c.id, pid: c.pid, parent: c.parent, author: c.author, text: c.body, ts: c.ts }));
        const fl = await q(sb.from('follows').select('follower,followee').limit(10000));
        const fcount = {}, gcount = {};
        fl.forEach(f => { fcount[f.followee] = (fcount[f.followee] || 0) + 1; gcount[f.follower] = (gcount[f.follower] || 0) + 1; });
        const following = me ? fl.filter(f => f.follower === me.username).map(f => f.followee) : [];
        const followers = me ? fl.filter(f => f.followee === me.username).map(f => f.follower) : [];
        let notifs = [], unreadN = 0, unreadM = 0, reports = [];
        if (me) {
          notifs = await q(sb.from('notifs').select('*').eq('to_u', me.username).order('ts', { ascending: false }).limit(40));
          unreadN = notifs.filter(n => !n.read).length;
          const mc = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('to_u', me.username).eq('read', false);
          unreadM = mc.count || 0;
          if (adm()) reports = await q(sb.from('reports').select('*').eq('status', 'open').order('ts', { ascending: false }).limit(100));
        }
        let txns = [], mytops = [], pend = [], wd = [];
        if (me) {
          txns = await q(sb.from('txns').select('kind,amount,note,ts').eq('username', me.username).order('ts', { ascending: false }).limit(30));
          mytops = await q(sb.from('topups').select('id,claimed,final,status,ts').eq('username', me.username).order('ts', { ascending: false }).limit(10));
          if (adm()) {
            pend = await q(sb.from('topups').select('id,username,claimed,ts').eq('status', 'pending').order('ts').limit(50));
          }
          if (adm()) out.withdrawPend = await q(sb.from('withdrawals').select('id,username,amount,method,target,ts').eq('status', 'pending').order('ts').limit(50));
          wd = await q(sb.from('withdrawals').select('id,amount,method,target,status,admin_note,ts,reviewed_ts').eq('username', me.username).order('ts', { ascending: false }).limit(20));
        }
        out = { packages: PACKAGES, txns, mytops, pend, withdrawals: wd || [], withdrawPend: out.withdrawPend || [], mine: me ? { balance: Number(me.balance), autoRenew: me.auto_renew, autoPkg: me.auto_pkg, vipUntil: me.vip_until } : null, me: me ? me.username : null, myBan: me ? me.banned_until : 0, users, posts, comments, saves: sv ? sv.ids : [], peers: pr.count || 0, visits: st ? Number(st.visits) : 0, following, followers, fcount, gcount, unreadN, unreadM,
          notifs: notifs.map(n => ({ id: n.id, kind: n.kind, actor: n.actor, pid: n.pid, ts: n.ts, read: n.read })),
          reports: reports.map(r => ({ id: r.id, pid: r.pid, cid: r.cid, reporter: r.reporter, reason: r.reason })) };
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
        ok(p.length >= 8 && p.length <= 100, 'Password minimal 8 karakter');
        ok(p !== u && !/^(?:(.)\1+|12345678\d*|password\d*|qwerty\w*)$/i.test(p), 'Password terlalu mudah ditebak');
        const disp = String(b.d || '').trim().slice(0, 24);
        const ex = await q(sb.from('users').select('username').eq('username', u).maybeSingle());
        ok(!ex, 'Username sudah dipakai');
        const { count } = await sb.from('users').select('username', { count: 'exact', head: true });
        const { error } = await sb.from('users').insert({ username: u, hash: await bcrypt.hash(p, 10), role: count === 0 ? 'owner' : 'user', display_name: disp });
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
      case 'view': {
        const added = await sb.rpc('track_post_event', { pid: String(b.id), visitor_key: vkey, event_kind: 'view' });
        out.counted = !!added.data;
        break;
      }
      case 'dl': {
        need();
        const p = await q(sb.from('posts').select('vip,author').eq('id', String(b.id)).maybeSingle());
        ok(p && (!p.vip || canVip(p)), 'Konten khusus VIP', 403);
        const added = await sb.rpc('track_post_event', { pid: String(b.id), visitor_key: vkey, event_kind: 'download' });
        out.counted = !!added.data;
        if (added.data) await notify(p.author, 'dl', b.id);
        break;
      }
      case 'like':
        need();
        {
          const lp = await q(sb.from('posts').select('author,likes,vip').eq('id', String(b.id)).maybeSingle());
          ok(lp, 'Info tidak ada');
          ok(!lp.vip || canVip(lp), 'Konten khusus VIP', 403);
          const liking = !(lp.likes || []).includes(me.username);
          const lr = await sb.rpc('toggle_like_reward', { pid: String(b.id), uname: me.username });
          if (lr.error) throw lr.error;
          const reward = Number(lr.data?.reward || 0);
          out.reward = reward;
          if (liking) await notify(lp.author, 'like', b.id);
        }
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
        const pp = await q(sb.from('posts').select('author,vip').eq('id', String(b.pid)).maybeSingle());
        ok(pp, 'Info tidak ada');
        ok(!pp.vip || canVip(pp), 'Konten khusus VIP', 403);
        await q(sb.from('comments').insert({ id: 'c' + rid(), pid: String(b.pid), parent, author: me.username, body: text, ts: Date.now() }));
        await notify(pp.author, 'comment', b.pid);
        if (b.reply) {
          const rc = await q(sb.from('comments').select('author').eq('id', String(b.reply)).maybeSingle());
          if (rc && rc.author !== pp.author) await notify(rc.author, 'reply', b.pid);
        }
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
        const row = { title, descr: String(b.desc || '').slice(0, 2000), cat: CATS.includes(b.cat) ? b.cat : 'lain', thumb: url(b.thumb), link, file_url: fileUrl, socials, vip: !!b.vip, tags: parseTags(b.tags), gver: String(b.gver || '').trim().slice(0, 12) };
        if (b.id) {
          const p = await q(sb.from('posts').select('author').eq('id', String(b.id)).maybeSingle());
          ok(p && (p.author === me.username || adm()), 'Tidak diizinkan', 403);
          await q(sb.from('posts').update(row).eq('id', String(b.id)));
        } else {
          const nid = 'p' + rid();
          await q(sb.from('posts').insert({ ...row, id: nid, author: me.username, ts: Date.now() }));
          const fw = await q(sb.from('follows').select('follower').eq('followee', me.username));
          if (fw.length) await sb.from('notifs').insert(fw.map(f => ({ to_u: f.follower, kind: 'newpost', actor: me.username, pid: nid, ts: Date.now() })));
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
        const t = await q(sb.from('users').select('username,role').eq('username', String(b.u)).maybeSingle());
        ok(t, 'User tidak ditemukan');
        ok(me.role === 'owner' || t.role === 'user', 'Admin hanya bisa mengelola pengguna biasa. Tag Owner/Admin hanya bisa diubah Owner.', 403);
        const tagText = String(b.tagText || '').slice(0, 20);
        if (me.role !== 'owner') ok(!RESERVED.test(norm(tagText)), 'Tag Owner/Admin hanya bisa diberikan oleh Owner', 403);
        const row = { tag_text: tagText, tag_color: /^#[0-9a-f]{6}$/i.test(b.tagColor) ? b.tagColor : '#6d4aff' };
        if (b.role && me.role === 'owner' && t.username !== me.username && ['user', 'admin', 'owner'].includes(b.role)) row.role = b.role;
        if (b.vipDays !== '' && b.vipDays != null) {
          const d = Number(b.vipDays);
          row.vip_until = d === 0 ? 0 : d < 0 ? FOREVER : Date.now() + d * 864e5;
        }
        if (b.banMin !== '' && b.banMin != null) {
          const m = Number(b.banMin);
          ok(m === 0 || (t.username !== me.username && t.role !== 'owner' && (me.role === 'owner' || t.role === 'user')), 'Tidak boleh memblokir user ini', 403);
          row.banned_until = m === 0 ? 0 : m < 0 ? FOREVER : Date.now() + m * 6e4;
        }
        await q(sb.from('users').update(row).eq('username', t.username));
        break;
      }
      case 'admpost':
        need(); ok(adm(), 'Hanya admin', 403);
        await q(sb.from('posts').update({ hidden: !!b.hidden }).eq('id', String(b.id)));
        break;
      case 'saveavatar':
        need();
        await q(sb.from('users').update({ avatar: url(b.url) }).eq('username', me.username));
        break;
      case 'follow': {
        need();
        const t = String(b.u || '');
        ok(t !== me.username, 'Tidak bisa mengikuti diri sendiri');
        const ex = await q(sb.from('users').select('username').eq('username', t).maybeSingle());
        ok(ex, 'User tidak ditemukan');
        const f = await q(sb.from('follows').select('follower').eq('follower', me.username).eq('followee', t).maybeSingle());
        if (f) await q(sb.from('follows').delete().eq('follower', me.username).eq('followee', t));
        else { await q(sb.from('follows').insert({ follower: me.username, followee: t })); await notify(t, 'follow'); }
        break;
      }
      case 'readnotifs':
        ok(me, 'Masuk dulu', 401);
        await sb.from('notifs').update({ read: true }).eq('to_u', me.username).eq('read', false);
        break;
      case 'inbox': {
        ok(me, 'Masuk dulu', 401);
        const ms = await q(sb.from('messages').select('*').or(`from_u.eq.${me.username},to_u.eq.${me.username}`).order('ts', { ascending: false }).limit(400));
        const map = {};
        ms.forEach(m => {
          const o = m.from_u === me.username ? m.to_u : m.from_u;
          if (!map[o]) map[o] = { u: o, last: m.body, ts: m.ts, mine: m.from_u === me.username, unread: 0 };
          if (m.to_u === me.username && !m.read) map[o].unread++;
        });
        out = { convs: Object.values(map) };
        break;
      }
      case 'thread': {
        ok(me, 'Masuk dulu', 401);
        const o = String(b.u || '');
        ok(/^[a-z0-9_]{3,20}$/.test(o), 'User tidak valid');
        const ms = await q(sb.from('messages').select('*').or(`and(from_u.eq.${me.username},to_u.eq.${o}),and(from_u.eq.${o},to_u.eq.${me.username})`).order('ts', { ascending: false }).limit(100));
        await sb.from('messages').update({ read: true }).eq('to_u', me.username).eq('from_u', o).eq('read', false);
        out = { msgs: ms.reverse().map(m => ({ id: m.id, body: m.body, ts: m.ts, mine: m.from_u === me.username })) };
        break;
      }
      case 'send': {
        need();
        const to = String(b.to || ''), body = String(b.body || '').trim().slice(0, 1000);
        ok(body, 'Pesan kosong');
        ok(to !== me.username, 'Tidak bisa mengirim pesan ke diri sendiri');
        const ex = await q(sb.from('users').select('username,role').eq('username', to).maybeSingle());
        ok(ex, 'User tidak ditemukan');
        const staff = ['owner', 'admin'].includes(me.role) || ['owner', 'admin'].includes(ex.role);
        if (!staff) {
          const fw = await q(sb.from('follows').select('follower,followee').or(`and(follower.eq.${me.username},followee.eq.${to}),and(follower.eq.${to},followee.eq.${me.username})`));
          ok(fw.length === 2, 'Untuk chat, kalian harus saling follow dulu', 403);
        }
        await q(sb.from('messages').insert({ from_u: me.username, to_u: to, body, ts: Date.now() }));
        break;
      }
      case 'report': {
        need();
        const pid = String(b.pid || ''), cid = String(b.cid || '');
        const ex = await q(sb.from('reports').select('id').eq('reporter', me.username).eq('pid', pid).eq('cid', cid).eq('status', 'open').limit(1));
        if (!ex.length) await q(sb.from('reports').insert({ pid, cid, reporter: me.username, reason: String(b.reason || '').trim().slice(0, 200), ts: Date.now() }));
        break;
      }
      case 'resolve':
        need(); ok(adm(), 'Hanya admin', 403);
        await q(sb.from('reports').update({ status: 'done' }).eq('id', Number(b.id)));
        break;
      case 'pinpost':
        need(); ok(adm(), 'Hanya admin', 403);
        await q(sb.from('posts').update({ pinned: !!b.pinned }).eq('id', String(b.id)));
        break;
      case 'savebio':
        need();
        await q(sb.from('users').update({ bio: String(b.bio || '').slice(0, 300), display_name: String(b.display || '').trim().slice(0, 24) }).eq('username', me.username));
        break;
      case 'chpw': {
        need();
        const x = await q(sb.from('users').select('hash').eq('username', me.username).maybeSingle());
        ok(await bcrypt.compare(String(b.old || ''), x.hash), 'Password lama salah');
        ok(String(b.new || '').length >= 8, 'Password baru minimal 8 karakter');
        await q(sb.from('users').update({ hash: await bcrypt.hash(String(b.new), 10) }).eq('username', me.username));
        break;
      }
      case 'signupload': {
        need();
        const kind = ['thumb', 'proof'].includes(b.kind) ? b.kind : 'file';
        const ext = kind === 'proof' ? 'jpg' : ((String(b.name || '').split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin');
        const bucket = kind === 'proof' ? 'proofs' : 'uploads';
        const path = `${kind}/${me.username}/${rid()}.${ext}`;
        const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
        if (error) throw error;
        out = { path, bucket, token: data.token, url: kind === 'proof' ? '' : sb.storage.from(bucket).getPublicUrl(path).data.publicUrl };
        break;
      }
      case 'buyvip': {
        need();
        const pkg = PACKAGES.find(p => p.id === b.pkg);
        ok(pkg, 'Paket tidak ditemukan');
        ok(await buyPkg(me.username, pkg), 'Saldo tidak cukup. Isi saldo dulu.');
        break;
      }
      case 'setauto': {
        need();
        const on = !!b.on, pkg = PACKAGES.find(p => p.id === b.pkg);
        ok(!on || pkg, 'Pilih paket untuk bayar otomatis');
        await q(sb.from('users').update({ auto_renew: on, auto_pkg: pkg ? pkg.id : '' }).eq('username', me.username));
        break;
      }
      case 'topup': {
        need();
        const amount = Math.floor(Number(b.amount));
        ok(amount >= 1000 && amount <= 5000000, 'Nominal harus Rp 1.000 - Rp 5.000.000');
        const path = String(b.path || '');
        ok(path.startsWith(`proof/${me.username}/`) && !path.includes('..'), 'Upload bukti pembayaran dulu');
        const pend = await q(sb.from('topups').select('id').eq('username', me.username).eq('status', 'pending'));
        ok(pend.length < 3, 'Masih ada 3 permintaan yang belum ditinjau. Tunggu admin memprosesnya.');
        await q(sb.from('topups').insert({ username: me.username, claimed: amount, proof_path: path, ts: Date.now() }));
        break;
      }
      case 'proofurl': {
        need(); ok(adm(), 'Hanya admin', 403);
        const t = await q(sb.from('topups').select('proof_path,status').eq('id', Number(b.id)).maybeSingle());
        ok(t && t.status === 'pending' && t.proof_path, 'Bukti tidak tersedia');
        const { data, error } = await sb.storage.from('proofs').createSignedUrl(t.proof_path, 120);
        if (error) throw error;
        out = { url: data.signedUrl };
        break;
      }
      case 'withdraw': {
        need();
        const amount = Math.floor(Number(b.amount));
        const method = ['gopay','dana','shopeepay','qris','bank'].includes(String(b.method)) ? String(b.method) : '';
        const target = String(b.target || '').trim().slice(0, 100);
        ok(amount >= 1000, 'Minimal penarikan Rp1.000');
        ok(method, 'Pilih metode penarikan');
        ok(target, 'Masukkan nomor HP, rekening, atau data QRIS tujuan');
        const wr = await sb.rpc('create_withdrawal', { uname: me.username, amount_in: amount, method_in: method, target_in: target });
        if (wr.error) throw wr.error;
        out.balance = Number(wr.data?.balance || 0);
        break;
      }
      case 'reviewwithdraw': {
        need(); ok(adm(), 'Hanya admin', 403);
        const w = await q(sb.from('withdrawals').select('*').eq('id', Number(b.id)).maybeSingle());
        ok(w && w.status === 'pending', 'Penarikan sudah diproses atau tidak ditemukan');
        const approve = !!b.approve;
        const note = String(b.note || '').trim().slice(0, 300);
        const upd = await q(sb.from('withdrawals').update({ status: approve ? 'approved' : 'rejected', admin_note: note, reviewed_by: me.username, reviewed_ts: Date.now() }).eq('id', w.id).eq('status', 'pending').select('id'));
        ok(upd.length, 'Sudah diproses admin lain');
        if (!approve) {
          await sb.rpc('add_balance', { uname: w.username, amt: w.amount });
          await sb.from('txns').insert({ username: w.username, kind: 'withdraw_refund', amount: w.amount, note: 'Penarikan ditolak admin, saldo dikembalikan', ts: Date.now() });
        } else {
          await sb.from('txns').insert({ username: w.username, kind: 'withdraw', amount: 0, note: `Penarikan ${w.method.toUpperCase()} disetujui admin`, ts: Date.now() });
        }
        await sb.from('notifs').insert({ to_u: w.username, kind: approve ? 'withdraw_ok' : 'withdraw_no', actor: me.username, pid: String(w.amount), ts: Date.now() });
        break;
      }
      case 'reviewtopup': {
        need(); ok(adm(), 'Hanya admin', 403);
        const t = await q(sb.from('topups').select('*').eq('id', Number(b.id)).maybeSingle());
        ok(t && t.status === 'pending', 'Permintaan tidak ditemukan atau sudah diproses');
        ok(t.username !== me.username || me.role === 'owner', 'Admin tidak boleh menyetujui top up sendiri', 403);
        const amt = Math.floor(Number(b.amount));
        if (b.approve) ok(amt >= 1 && amt <= 10000000, 'Nominal tidak valid');
        const upd = await q(sb.from('topups').update({ status: b.approve ? 'approved' : 'rejected', final: b.approve ? amt : 0, proof_path: '', reviewed_by: me.username, reviewed_ts: Date.now() }).eq('id', t.id).eq('status', 'pending').select('id'));
        ok(upd.length, 'Sudah diproses admin lain');
        if (b.approve) {
          await sb.rpc('add_balance', { uname: t.username, amt });
          await sb.from('txns').insert({ username: t.username, kind: 'topup', amount: amt, note: 'Top up disetujui', ts: Date.now() });
        }
        // bukti dihapus permanen setelah ditinjau
        if (t.proof_path) { try { await sb.storage.from('proofs').remove([t.proof_path]); } catch (e) { console.error('hapus bukti gagal', e); } }
        await sb.from('notifs').insert({ to_u: t.username, kind: b.approve ? 'topup_ok' : 'topup_no', actor: me.username, pid: b.approve ? String(amt) : '', ts: Date.now() });
        break;
      }
      default:
        throw new Err('Aksi tidak dikenal');
    }
    res.status(200).json(out);
  } catch (e) {
    if (!e.c) console.error(e);
    res.status(e.c || 500).json({ error: e.c ? e.message : 'Server error', detail: e.c ? undefined : String(e.message || e.code || e).slice(0, 200) });
  }
};
