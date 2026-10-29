// Benchmark cloud adapter: gives the app the same db / user / assets / room interface it uses everywhere,
// backed by Supabase (Postgres + Auth + Storage + Realtime). Loaded before the app script.
(() => {
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
  const CFG = window.BMK_CONFIG || {};
  const SB_URL = CFG.url, SB_KEY = CFG.key;
  if (!window.supabase || !SB_URL) { console.warn("Benchmark cloud: not configured"); return; }
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  window.__sb = sb;
  const DOC_TABLES = new Set(["projects", "areas", "scans", "pins", "shots", "media", "sheets", "signoffs", "feedback"]);
  const COLS = { projectId: "project_id", areaId: "area_id" };
  const PEER = "p" + Math.random().toString(36).slice(2, 10);
  let SESSION = null;

  // ---------------- sign in ----------------
  const css = `
  #bmk-auth { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; background: #0e1418; font: 15px/1.45 Inter, system-ui, sans-serif; color: #eef3f5; }
  #bmk-auth form { width: min(400px, 100%); background: #141c21; border: 1px solid #2b3b45; border-radius: 16px; padding: 26px; display: flex; flex-direction: column; gap: 12px; }
  #bmk-auth h1 { font-size: 24px; margin: 0; } #bmk-auth p { margin: 0; color: #9db0b9; font-size: 14px; }
  #bmk-auth label { font-size: 13px; color: #9db0b9; display: flex; flex-direction: column; gap: 5px; }
  #bmk-auth input { font: inherit; color: inherit; background: #1a242b; border: 1px solid #2b3b45; border-radius: 10px; padding: 11px 12px; }
  #bmk-auth button { font: inherit; font-weight: 600; border-radius: 10px; padding: 11px; border: 1px solid #2b3b45; background: #223039; color: inherit; cursor: pointer; }
  #bmk-auth button.primary { background: #4c7dff; border-color: #4c7dff; color: #fff; }
  #bmk-auth .link { background: none; border: 0; color: #8fb3ff; padding: 0; font-weight: 500; text-align: left; }
  #bmk-auth .msg { font-size: 13.5px; color: #ffd27a; min-height: 1em; } #bmk-auth .msg.ok { color: #8fe3b0; }
  #bmk-auth .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 20px; }`;
  let mode = "signin";
  function authUI() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", authUI, { once: true }); return; }
    if (document.getElementById("bmk-auth")) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const el = document.createElement("div"); el.id = "bmk-auth";
    document.body.appendChild(el); drawAuth();
  }
  function drawAuth(msg = "", ok = false) {
    const el = document.getElementById("bmk-auth"); if (!el) return;
    const up = mode === "signup", link = mode === "link";
    el.innerHTML = `<form id="bmk-auth-form" novalidate>
      <div class="brand"><svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 9l7 11H9z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 25h18" stroke="#ff4f8b" stroke-width="2.4"/></svg>Benchmark</div>
      <h1>${up ? "Create your account" : link ? "Get a sign-in link" : "Sign in"}</h1>
      <p>${up ? "Your team sees this name on pins and replies." : link ? "We'll email you a link. No password needed." : "Scan it. Check it. Sign it off."}</p>
      ${up ? `<label>Your name<input id="bmk-name" autocomplete="name" required placeholder="Marco Silva"></label>` : ""}
      <label>Work email<input id="bmk-email" type="email" autocomplete="email" required placeholder="you@company.com"></label>
      ${link ? "" : `<label>Password<input id="bmk-pass" type="password" autocomplete="${up ? "new-password" : "current-password"}" required minlength="8" placeholder="${up ? "8 characters or more" : ""}"></label>`}
      <button class="primary" type="submit">${up ? "Create account" : link ? "Email me a link" : "Sign in"}</button>
      <div class="msg ${ok ? "ok" : ""}" role="status">${msg}</div>
      ${up ? `<button class="link" type="button" data-m="signin">I already have an account</button>` : `<button class="link" type="button" data-m="signup">New here? Create an account</button>`}
      ${link ? `<button class="link" type="button" data-m="signin">Use a password instead</button>` : (window.BMK_CONFIG.magicLink ? `<button class="link" type="button" data-m="link">Email me a sign-in link instead</button>` : "")}
    </form>`;
    el.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { mode = b.dataset.m; drawAuth(); }));
    el.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const email = (el.querySelector("#bmk-email").value || "").trim(), pass = el.querySelector("#bmk-pass") ? el.querySelector("#bmk-pass").value : "";
      const btn = el.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        if (!email) throw new Error("Enter your email.");
        if (mode === "signup") {
          const name = (el.querySelector("#bmk-name").value || "").trim();
          if (!name) throw new Error("Enter your name.");
          if (pass.length < 8) throw new Error("Use at least 8 characters for the password.");
          const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name }, emailRedirectTo: location.href.split("#")[0] } });
          if (error) throw error;
          if (!data.session) { mode = "signin"; drawAuth("Check your email to confirm your account, then sign in.", true); return; }
        } else if (mode === "link") {
          const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
          if (error) throw error;
          drawAuth("Link sent. Open it on this device.", true); return;
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password: pass });
          if (error) throw error;
        }
      } catch (err) { drawAuth(friendly(err)); }
      finally { const b = el.querySelector("button[type=submit]"); if (b) b.disabled = false; }
    };
  }
  const friendly = (e) => {
    const m = (e && e.message) || String(e);
    if (/invalid login/i.test(m)) return "That email and password don't match.";
    if (/already registered/i.test(m)) return "That email already has an account. Sign in instead.";
    if (/rate limit/i.test(m)) return "Too many tries. Wait a minute and try again.";
    if (/not confirmed/i.test(m)) return "Confirm your email first, then sign in.";
    return m;
  };
  let resolveSession; const sessionReady = new Promise((r) => (resolveSession = r));
  sb.auth.onAuthStateChange((ev, s) => {
    if (s && !SESSION) { SESSION = s; const el = document.getElementById("bmk-auth"); if (el) el.remove(); resolveSession(s); }
    if (ev === "SIGNED_OUT") location.reload();
  });
  sb.auth.getSession().then(({ data }) => { if (data.session) { SESSION = SESSION || data.session; resolveSession(data.session); } else authUI(); });
  const uid = () => SESSION && SESSION.user.id;

  // ---------------- database ----------------
  const snapDoc = (id, d) => ({ id, exists: !!d, data: () => d });
  const toErr = (e) => { const x = new Error((e && e.message) || "Couldn't save"); x.code = (e && e.code === "42501") || /row-level security/i.test((e && e.message) || "") ? "invalid_argument" : (e && e.code) || "unknown"; return x; };
  // one realtime channel per table, shared by every listener on it
  const TCH = {};
  function tableFeed(t) {
    if (TCH[t]) return TCH[t];
    const subs = new Set(); let status = "init";
    const ch = sb.channel("t:" + t + ":" + PEER).on("postgres_changes", { event: "*", schema: "public", table: t }, (m) => { for (const f of subs) f(m); })
      .subscribe((s) => { const was = status; status = s; if (s === "SUBSCRIBED" && was !== "init") for (const f of subs) f({ resync: true }); });
    return (TCH[t] = { subs, ch });
  }
  // apply our own writes locally right away, the way a realtime echo would, so screens don't wait for the round trip
  const rowOf = (t, id, data) => ({ id, data, project_id: data && data.projectId, area_id: t === "areas" ? id : data && data.areaId });
  function localEcho(t, ev) { const feed = TCH[t]; if (!feed) return; for (const f of feed.subs) try { f({ ...ev, local: true }); } catch (e) { console.error(e); } }
  function parse(path) { const seg = path.split("/"); return { t: seg[0], id: seg[1] }; }
  const match = (row, filters) => filters.every(([f, , v]) => {
    if (COLS[f]) return (f === "projectId" ? row.project_id ?? (row.data && row.data.projectId) : row.area_id ?? (row.data && row.data.areaId)) === v;
    return row.data && row.data[f] === v;
  });
  async function fetchRows(t, filters) {
    let q = sb.from(t).select("id, data" + (t === "projects" || t === "signoffs" || t === "feedback" ? "" : ", project_id, area_id"));
    for (const [f, op, v] of filters) {
      if (op !== "==") throw new Error("Only == filters are supported");
      if (COLS[f]) q = q.eq(COLS[f], v);
      else q = q.eq("data->>" + f, typeof v === "string" ? v : JSON.stringify(v));
    }
    const out = []; let from = 0;
    for (;;) { const { data, error } = await q.range(from, from + 999); if (error) throw toErr(error); out.push(...data); if (data.length < 1000) break; from += 1000; }
    return out;
  }
  const db = {
    doc(path) {
      const { t, id } = parse(path);
      if (!DOC_TABLES.has(t)) throw new Error("Unknown collection " + t);
      return { id, path,
        async get() { const { data, error } = await sb.from(t).select("data").eq("id", id).maybeSingle(); if (error) throw toErr(error); return snapDoc(id, data ? data.data : undefined); },
        async set(d) {
          const clean = JSON.parse(JSON.stringify(d));
          const up = await sb.from(t).update({ data: clean }).eq("id", id).select("id");
          if (up.error) throw toErr(up.error);
          if (!up.data.length) { const ins = await sb.from(t).insert({ id, data: clean }); if (ins.error) throw toErr(ins.error); }
          localEcho(t, { eventType: up.data.length ? "UPDATE" : "INSERT", new: rowOf(t, id, clean) });
        },
        async update(d) { const { data, error } = await sb.rpc("doc_update", { t, doc_id: id, patch: JSON.parse(JSON.stringify(d)) }); if (error) throw toErr(error); if (data) localEcho(t, { eventType: "UPDATE", new: rowOf(t, id, data) }); },
        async delete() { const { error } = await sb.from(t).delete().eq("id", id); if (error) throw toErr(error); localEcho(t, { eventType: "DELETE", old: { id } }); },
        onSnapshot(next, onErr) {
          let live = true; const feed = tableFeed(t);
          const pull = () => this.get().then((s) => live && next(s)).catch((e) => onErr && onErr(e));
          const f = (m) => { if (m.local && m.new && m.new.id === id) return next(snapDoc(id, m.new.data)); if (m.resync || (m.new && m.new.id === id) || (m.old && m.old.id === id)) pull(); };
          feed.subs.add(f); pull();
          return () => { live = false; feed.subs.delete(f); };
        } };
    },
    collection(t) {
      if (!DOC_TABLES.has(t)) throw new Error("Unknown collection " + t);
      const mk = (filters) => ({
        where(f, op, v) { return mk([...filters, [f, op, v]]); }, orderBy() { return this; }, limit() { return this; },
        doc(id) { return db.doc(t + "/" + (id || Math.random().toString(36).slice(2, 14))); },
        async get() { const rows = await fetchRows(t, filters); const docs = rows.map((r) => snapDoc(r.id, r.data)); return { docs, size: docs.length, empty: !docs.length }; },
        onSnapshot(next, onErr) {
          let live = true; const cache = new Map(); const feed = tableFeed(t); let timer = null;
          const fire = () => { const docs = [...cache.values()].map((r) => snapDoc(r.id, r.data)); next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [] }); };
          const emit = (now) => { if (!live) return; clearTimeout(timer); if (now) fire(); else timer = setTimeout(fire, 30); };
          const load = () => fetchRows(t, filters).then((rows) => { cache.clear(); for (const r of rows) cache.set(r.id, r); emit(); }).catch((e) => onErr && onErr(e));
          const f = (m) => {
            if (m.resync) return load();
            if (m.eventType === "DELETE") { if (m.old && cache.delete(m.old.id)) emit(m.local); return; }
            const r = m.new; if (!r) return;
            if (match(r, filters)) cache.set(r.id, r); else if (!cache.delete(r.id)) return;
            emit(m.local);
          };
          feed.subs.add(f); load();
          return () => { live = false; feed.subs.delete(f); };
        } });
      return mk([]);
    },
  };

  // ---------------- people ----------------
  let ADMIN = null;
  const user = {
    async me() { const u = SESSION.user; const { data } = await sb.from("profiles").select("name").eq("id", u.id).maybeSingle(); return { id: u.id, name: (data && data.name) || (u.user_metadata && u.user_metadata.full_name) || u.email.split("@")[0], avatarUrl: null }; },
    async id() { return uid(); },
    async canEdit() { if (ADMIN === null) { const { data } = await sb.from("app_admins").select("user_id").eq("user_id", uid()).maybeSingle(); ADMIN = !!data; } return ADMIN; },
    async isOwner() { return user.canEdit(); },
    async can() { return true; },
    async profiles(ids) { const list = [...new Set(ids)].filter((x) => /^[0-9a-f-]{36}$/i.test(x)); if (!list.length) return {}; const { data } = await sb.from("profiles").select("id, name").in("id", list); return Object.fromEntries((data || []).map((r) => [r.id, { name: r.name }])); },
    async search(q) { q = (q || "").trim(); if (!/.+@.+\..+/.test(q)) return []; const { data } = await sb.rpc("find_user", { q }); return (data || []).filter((r) => r.id !== uid()).map((r) => ({ id: r.id, name: r.name })); },
  };

  // ---------------- files ----------------
  const pub = (path) => sb.storage.from("files").getPublicUrl(path).data.publicUrl;
  window.__bmkAssetUrl = (id) => id && id.startsWith("demo/") ? (CFG.demoBase || "./") + id : pub(id);
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "application/pdf": "pdf", "text/plain": "txt" };
  const assets = {
    async upload(blob, opts) {
      const type = (opts && opts.type) || blob.type || "application/octet-stream";
      const path = `${uid()}/${uuid()}.${EXT[type] || "bin"}`;
      const { error } = await sb.storage.from("files").upload(path, blob, { contentType: type, upsert: false });
      if (error) { const e = new Error(error.message); e.code = /exceeded|too large|413/i.test(error.message) ? "too_large" : "unknown"; throw e; }
      return { id: path, url: pub(path), sizeBytes: blob.size, contentType: type };
    },
    async list() { return { assets: [], usage: null }; },
    async delete(id) { await sb.storage.from("files").remove([id]); },
  };

  // ---------------- live review rooms ----------------
  async function me_() { try { return await user.me(); } catch { return { id: uid(), name: "" }; } }
  function makeRoom(name) {
    const ch = sb.channel("room:" + name, { config: { presence: { key: PEER }, broadcast: { self: false } } });
    const ph = new Set(), th = {}; let mine = {}, ready = false, pending = false, prev = new Map();
    const snap = () => {
      const st = ch.presenceState(), out = [];
      for (const [key, metas] of Object.entries(st)) { const m = metas[metas.length - 1] || {}; out.push({ peer: key, by: m.by, isMe: key === PEER, sameTab: key === PEER, kind: "viewer", guest: false, presence: m.presence || {}, updatedAt: m.at || Date.now() }); }
      if (!out.some((p) => p.isMe)) out.push({ peer: PEER, by: uid(), isMe: true, sameTab: true, kind: "viewer", guest: false, presence: mine, updatedAt: Date.now() });
      return Object.freeze(out);
    };
    const deliver = () => { const arr = snap(); const now = new Map(arr.map((p) => [p.peer, p])); const joined = arr.filter((p) => !prev.has(p.peer)), left = [...prev.values()].filter((p) => !now.has(p.peer)); prev = now; for (const h of ph) try { h({ peers: arr, joined, left, updated: [] }); } catch (e) { console.error(e); } };
    const track = () => { if (!ready) { pending = true; return Promise.resolve(); } return ch.track({ by: uid(), presence: mine, at: Date.now() }); };
    ch.on("presence", { event: "sync" }, deliver);
    ch.on("broadcast", { event: "*" }, ({ event, payload }) => { (th[event] || []).forEach((h) => { try { h({ topic: event, data: payload && payload.data, peer: payload && payload.peer, by: payload && payload.by, isMe: false, sameTab: false, kind: "viewer", guest: false }); } catch (e) { console.error(e); } }); });
    ch.subscribe((s) => { if (s === "SUBSCRIBED") { ready = true; if (pending || Object.keys(mine).length) { pending = false; track(); } deliver(); } });
    return {
      presence: async (patch) => { mine = { ...mine }; for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete mine[k]; else mine[k] = v; } await track(); deliver(); },
      onPeers: (h) => { ph.add(h); setTimeout(() => h({ peers: snap(), joined: [...snap()], left: [], updated: [] }), 0); return () => ph.delete(h); },
      on: (topic, h) => { (th[topic] = th[topic] || []).push(h); return () => { th[topic] = (th[topic] || []).filter((x) => x !== h); }; },
      emit: async (topic, data) => { await ch.send({ type: "broadcast", event: topic, payload: { data, peer: PEER, by: uid() } }); (th[topic] || []).forEach((h) => h({ topic, data, peer: PEER, by: uid(), isMe: true, sameTab: true, kind: "viewer", guest: false })); },
      peers: snap,
      leave: () => { try { ch.untrack(); } catch {} sb.removeChannel(ch); },
      join: (n) => makeRoom(n),
    };
  }
  let LOBBY = null;

  // ---------------- downloads ----------------
  const downloads = { async save({ filename, data }) { const b = data instanceof Blob ? data : new Blob([data], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); } };

  // ---------------- cloud-only helpers the app calls ----------------
  window.BMK_CLOUD = {
    sb,
    async projectBrief(pid) { const { data, error } = await sb.rpc("project_brief", { pid }); if (error) throw error; return data; },
    async requestJoin(pid, role) { const { error } = await sb.rpc("request_join", { pid, wanted: role }); if (error) throw toErr(error); },
    async signOut() { await sb.auth.signOut(); },
    email: () => SESSION && SESSION.user.email,
  };

  window.claude = { use: async (n) => {
    await sessionReady;
    if (n === "db") return db;
    if (n === "user") return user;
    if (n === "assets") return assets;
    if (n === "downloads") return downloads;
    if (n === "room") { if (!LOBBY) LOBBY = makeRoom("lobby"); return LOBBY; }
    return null; // AI assistant runs through a server function, added later
  } };
})();
