/* MFlash Maintenance & Service — aplikasi langganan (Supabase + JS murni) */
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const S = { user: null, profil: null, cabang: [], paket: null, benefit: [], set: {}, fc: "" };
const charts = [];

/* ---------- utilitas ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
const rpJt = (n) => { n = Number(n || 0); return Math.abs(n) >= 1e9 ? "Rp " + (n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M" : Math.abs(n) >= 1e6 ? "Rp " + (n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt" : rp(n); };
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_P = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const tgl = (d) => { if (!d) return "-"; const x = new Date(String(d).slice(0, 10) + "T00:00:00"); return `${x.getDate()} ${BULAN[x.getMonth()]} ${x.getFullYear()}`; };
const tglP = (d) => { if (!d) return "-"; const x = new Date(String(d).slice(0, 10) + "T00:00:00"); return `${x.getDate()} ${BULAN_P[x.getMonth()]} ${x.getFullYear()}`; };
const blnLabel = (d) => { const x = new Date(String(d).slice(0, 10) + "T00:00:00"); return `${BULAN[x.getMonth()]} ${String(x.getFullYear()).slice(2)}`; };
const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const today = () => iso(new Date());
const bulanIni = () => today().slice(0, 7) + "-01";
const addMonth = (p, n) => { const d = new Date(p + "T00:00:00"); d.setMonth(d.getMonth() + n); return iso(d).slice(0, 7) + "-01"; };
const isAdmin = () => S.profil?.peran === "super_admin";
const cabangNama = (id) => S.cabang.find((c) => c.id === id)?.nama || "-";
const setting = (k, d = "") => S.set[k] ?? d;

function toast(msg, bad = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : "");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), bad ? 6000 : 3000);
}
function cek({ data, error }) { if (error) { toast(error.message, true); throw error; } return data; }
function modal(title, html, onOpen) {
  $("#modalTitle").textContent = title; $("#modalBody").innerHTML = html;
  $("#modal").classList.remove("hidden"); onOpen && onOpen($("#modalBody"));
}
const tutupModal = () => $("#modal").classList.add("hidden");
const fd = (form) => Object.fromEntries(new FormData(form).entries());
function q(table, cols = "*", opt) { let x = sb.from(table).select(cols, opt); if (isAdmin() && S.fc) x = x.eq("cabang_id", +S.fc); return x; }
function cabangSelect(name = "cabang_id", val = "") {
  if (!isAdmin()) return `<input type="hidden" name="${name}" value="${S.profil.cabang_id}">`;
  return `<label>Cabang<select name="${name}" required><option value="">Pilih cabang</option>${S.cabang.map((c) => `<option value="${c.id}" ${+val === c.id || (!val && +S.fc === c.id) ? "selected" : ""}>${esc(c.nama)}</option>`).join("")}</select></label>`;
}
function waLink(no, text) {
  let n = String(no || "").replace(/\D/g, ""); if (n.startsWith("0")) n = "62" + n.slice(1);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : "";
}
async function upload(path, blob, type) {
  cek(await sb.storage.from("dokumen").upload(path, blob, { upsert: true, contentType: type }));
  return path;
}
async function signedUrl(path) {
  if (!path) return "";
  const { data } = await sb.storage.from("dokumen").createSignedUrl(path, 3600);
  return data?.signedUrl || "";
}
const dataUrlToBlob = async (u) => (await fetch(u)).blob();
function hariBadge(h) {
  if (h < 0) return `<span class="badge b-bad">Terlambat ${-h} hari</span>`;
  if (h === 0) return `<span class="badge b-warn">Hari ini</span>`;
  return `<span class="badge ${h <= 3 ? "b-warn" : "b-info"}">H-${h}</span>`;
}
const STATUS = {
  aktif: "b-good", lunas: "b-good", selesai: "b-good", dipenuhi: "b-good",
  menunggu_ttd: "b-warn", belum_bayar: "b-warn", terjadwal: "b-info", dijadwal_ulang: "b-info", belum: "b-warn", draft: "b-mute",
  terlewat: "b-bad", ditangguhkan: "b-bad", batal: "b-mute", berakhir: "b-mute",
};
const stBadge = (s) => `<span class="badge ${STATUS[s] || "b-mute"}">${esc(String(s).replace(/_/g, " "))}</span>`;
function sigPad(canvas) {
  const r = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = canvas.offsetWidth * r; canvas.height = canvas.offsetHeight * r;
  canvas.getContext("2d").scale(r, r);
  return new SignaturePad(canvas, { penColor: "#0b1f44", backgroundColor: "rgba(255,255,255,0)" });
}

/* ---------- pesan WhatsApp ---------- */
function pesanWA(jenis, r) {
  const pt = setting("nama_perusahaan", "MFlash");
  const sapa = `Halo ${r.nama_pic || "Bapak/Ibu"} (${r.pelanggan}),`;
  if (jenis === "tagihan") {
    const telat = r.sisa_hari < 0;
    return `${sapa}\n\n${telat ? `Tagihan langganan maintenance Anda sudah *terlambat ${-r.sisa_hari} hari*.` : "Kami mengingatkan tagihan langganan maintenance Anda:"}\n\nNo. Akad: ${r.nomor_akad}\nJumlah: *${rp(r.nominal)}*\nJatuh tempo: ${tglP(r.tanggal)}\n\nPembayaran ke: ${setting("rekening_pembayaran", "-")}\nMohon kirim bukti transfer ke nomor ini. Abaikan pesan ini bila sudah membayar.\n\nTerima kasih,\n${pt} Maintenance — Cabang ${r.cabang}`;
  }
  if (jenis === "kunjungan") return `${sapa}\n\nTeknisi ${pt} dijadwalkan melakukan *kunjungan maintenance rutin* pada *${tglP(r.tanggal)}* (akad ${r.nomor_akad}).\n\nMohon konfirmasi apakah jadwal ini sesuai, atau beri tahu kami waktu yang lebih cocok.\n\nTerima kasih,\n${pt} Maintenance — Cabang ${r.cabang}`;
  if (jenis === "benefit") return `${sapa}\n\nSebagai pelanggan langganan maintenance ${pt} (akad ${r.nomor_akad}), Anda berhak atas benefit *${r.benefit || "langganan"}* yang akan kami penuhi paling lambat ${tglP(r.tanggal)}.\n\nKapan waktu yang cocok untuk pelaksanaannya?\n\nTerima kasih,\n${pt} Maintenance — Cabang ${r.cabang}`;
  return `${sapa}\n\nAkad langganan maintenance *${r.nomor_akad}* akan berakhir pada *${tglP(r.tanggal)}*. Agar layanan tidak terputus, kami siap membantu proses perpanjangan.\n\nTerima kasih,\n${pt} Maintenance — Cabang ${r.cabang}`;
}
async function kirimWA(jenis, r) {
  const url = waLink(r.no_wa, pesanWA(jenis, r));
  if (!url) return toast("Nomor WA pelanggan belum diisi", true);
  window.open(url, "_blank");
  const tahap = r.sisa_hari === 0 ? "H-0" : r.sisa_hari > 0 ? `H-${r.sisa_hari}` : `H+${-r.sisa_hari}`;
  await sb.from("log_pengingat").insert({ jenis, ref_id: r.ref_id, channel: "whatsapp", tahap, dikirim_oleh: S.user.id });
}

/* ---------- navigasi ---------- */
const ROUTES = [
  ["dashboard", "Dashboard"], ["pengingat", "Pengingat"], ["akad", "Akad"], ["tagihan", "Tagihan"],
  ["kunjungan", "Kunjungan"], ["benefit", "Benefit"], ["pelanggan", "Pelanggan"], ["pengaturan", "Pengaturan", true],
];
function renderNav(active, count) {
  $("#nav").innerHTML = ROUTES.filter((r) => !r[2] || isAdmin())
    .map(([k, l]) => `<a href="#/${k}" class="${active === k ? "on" : ""}">${l}${k === "pengingat" && count ? `<span class="count">${count}</span>` : ""}</a>`).join("");
}
async function router() {
  charts.splice(0).forEach((c) => c.destroy());
  const [route, id] = (location.hash.replace(/^#\//, "") || "dashboard").split("/");
  const r = ROUTES.find((x) => x[0] === route) || ROUTES[0];
  if (r[2] && !isAdmin()) { location.hash = "#/dashboard"; return; }
  $("#side").classList.remove("open");
  window.scrollTo(0, 0);
  $("#pageTitle").textContent = r[1];
  renderNav(r[0], S.jumlahPengingat);
  $("#view").innerHTML = `<div class="empty">Memuat…</div>`;
  try { await VIEWS[r[0]](id); } catch (e) { console.error(e); $("#view").innerHTML = `<div class="card err">Gagal memuat: ${esc(e.message)}</div>`; }
}
async function hitungPengingat() {
  const { count } = await q("v_pengingat", "ref_id", { count: "exact", head: true }).lte("sisa_hari", 0);
  S.jumlahPengingat = count || 0;
}

/* ---------- boot ---------- */
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { $("#login").classList.remove("hidden"); $("#app").classList.add("hidden"); return; }
  S.user = session.user;
  const { data: prof } = await sb.from("profil").select("*").eq("user_id", S.user.id).maybeSingle();
  if (!prof) { await sb.auth.signOut(); $("#loginErr").textContent = "Akun belum diatur oleh Super Admin."; $("#login").classList.remove("hidden"); return; }
  S.profil = prof;
  await muatMaster();
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#whoami").innerHTML = `<b>${esc(prof.nama)}</b><small>${isAdmin() ? "Super Admin" : "Cabang " + esc(cabangNama(prof.cabang_id))}</small>`;
  const cf = $("#cabangFilter");
  if (isAdmin()) {
    cf.classList.remove("hidden");
    cf.innerHTML = `<option value="">Semua cabang</option>` + S.cabang.map((c) => `<option value="${c.id}">${esc(c.nama)}</option>`).join("");
    cf.onchange = async () => { S.fc = cf.value; await hitungPengingat(); router(); };
  }
  await hitungPengingat();
  window.onhashchange = router; router();
}
async function muatMaster() {
  const [c, p, b, s] = await Promise.all([
    sb.from("cabang").select("*").order("nama"), sb.from("paket").select("*").eq("aktif", true).order("id").limit(1),
    sb.from("benefit").select("*").order("id"), sb.from("pengaturan").select("*"),
  ]);
  S.cabang = c.data || []; S.paket = (p.data || [])[0] || null; S.benefit = b.data || [];
  S.set = Object.fromEntries((s.data || []).map((r) => [r.kunci, r.nilai]));
}
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault(); $("#loginErr").textContent = "";
  let { email, password } = fd(e.target);
  email = email.trim().toLowerCase();
  if (!email.includes("@")) email = email.replace(/\s+/g, "") + "@cabang.mflash.id"; // login cabang pakai username
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { $("#loginErr").textContent = /fetch|network/i.test(error.message) ? "Tidak bisa terhubung ke server. Cek koneksi atau config.js." : "Username/email atau password salah."; return; }
  boot();
};
$("#logout").onclick = async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); };
$("#modalX").onclick = tutupModal;
$("#modal").onclick = (e) => { if (e.target.id === "modal") tutupModal(); };
$("#menuBtn").onclick = () => $("#side").classList.toggle("open");

/* =====================================================================
   VIEWS
   ===================================================================== */
const VIEWS = {};

/* ---------- DASHBOARD ---------- */
VIEWS.dashboard = async () => {
  const p0 = bulanIni(), p6 = addMonth(p0, -5);
  const [kpi, bul, kun, ping] = await Promise.all([
    q("v_kpi_cabang"), q("v_bulanan").gte("periode", p6).lte("periode", p0),
    q("kunjungan", "status").eq("periode", p0), q("v_pengingat").order("sisa_hari").limit(8),
  ]);
  const K = cek(kpi), B = cek(bul), KU = cek(kun), P = cek(ping);
  const sum = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
  const mitra = sum(K, "mitra_aktif");
  const target = isAdmin() && !S.fc ? Number(setting("target_mitra_aktif", 162)) : null;
  const bIni = B.filter((r) => r.periode === p0);
  const ditagih = sum(bIni, "ditagih"), terbayar = sum(bIni, "terbayar"), gp = sum(bIni, "gross_profit");
  const kunAktif = KU.filter((r) => r.status !== "batal");
  const kunSelesai = kunAktif.filter((r) => r.status === "selesai").length;
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

  // seri 6 bulan
  const bulan = [...Array(6)].map((_, i) => addMonth(p6, i));
  const agg = (k) => bulan.map((m) => sum(B.filter((r) => r.periode === m), k));

  $("#view").innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="lbl">Mitra aktif</div><div class="val">${mitra}${target ? `<span class="muted" style="font-size:14px"> / ${target}</span>` : ""}</div>
      ${target ? `<div class="bar"><i style="width:${Math.min(100, pct(mitra, target))}%"></i></div><div class="sub">${pct(mitra, target)}% dari target</div>` : `<div class="sub">${sum(K, "akad_aktif")} akad aktif</div>`}</div>
    <div class="kpi"><div class="lbl">Pendapatan berulang / bulan</div><div class="val">${rpJt(sum(K, "mrr"))}</div><div class="sub">${sum(K, "unit_dimaintain")} unit di-maintain</div></div>
    <div class="kpi"><div class="lbl">Gross profit ${BULAN_P[+p0.slice(5, 7) - 1]}</div><div class="val">${rpJt(gp)}</div><div class="sub">Tagihan ${rpJt(ditagih)} dikurangi biaya</div></div>
    <div class="kpi"><div class="lbl">Tagihan terbayar bulan ini</div><div class="val">${pct(terbayar, ditagih)}%</div><div class="bar"><i style="width:${pct(terbayar, ditagih)}%"></i></div><div class="sub">${rpJt(terbayar)} dari ${rpJt(ditagih)}</div></div>
    <div class="kpi"><div class="lbl">Piutang terlambat</div><div class="val" style="color:${sum(K, "piutang_terlambat") ? "var(--bad)" : "inherit"}">${rpJt(sum(K, "piutang_terlambat"))}</div><div class="sub">Lewat jatuh tempo</div></div>
    <div class="kpi"><div class="lbl">Kunjungan bulan ini</div><div class="val">${kunSelesai}<span class="muted" style="font-size:14px"> / ${kunAktif.length}</span></div><div class="bar"><i style="width:${pct(kunSelesai, kunAktif.length)}%"></i></div><div class="sub">${sum(K, "benefit_terlambat")} benefit terlambat</div></div>
  </div>
  <div class="grid2">
    <div class="card"><h3>Tagihan vs terbayar, 6 bulan</h3>
      <div class="legend"><span><i style="background:var(--s1)"></i>Ditagih</span><span><i style="background:var(--s2)"></i>Terbayar</span></div>
      <div class="chart-box"><canvas id="c1" aria-label="Grafik tagihan dan pembayaran 6 bulan"></canvas></div></div>
    <div class="card"><h3>Gross profit, 6 bulan</h3><div class="legend">&nbsp;</div>
      <div class="chart-box"><canvas id="c2" aria-label="Grafik gross profit 6 bulan"></canvas></div></div>
  </div>
  <div class="card"><div class="card-head"><h3>Perlu tindakan</h3><a class="btn sm" href="#/pengingat">Lihat semua</a></div>
    ${P.length ? `<div class="tbl-wrap"><table><thead><tr><th>Jenis</th><th>Pelanggan</th><th>Tanggal</th><th>Status</th><th></th></tr></thead><tbody>
    ${P.map((r) => `<tr><td>${labelJenis(r.jenis)}</td><td>${esc(r.pelanggan)}<small>${esc(r.cabang)} · ${esc(r.nomor_akad)}</small></td><td>${tgl(r.tanggal)}</td><td>${hariBadge(r.sisa_hari)}</td><td class="act"><button class="btn wa sm" data-wa='${esc(JSON.stringify(r))}'>WhatsApp</button></td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">Tidak ada tagihan, kunjungan, atau benefit yang jatuh tempo dalam 7 hari.</div>`}
  </div>
  ${isAdmin() && !S.fc ? `<div class="card"><h3>Per cabang</h3><div class="tbl-wrap"><table><thead><tr><th>Cabang</th><th class="num">Mitra aktif</th><th class="num">Pendapatan / bln</th><th class="num">Unit</th><th class="num">Terbayar bln ini</th><th class="num">Piutang terlambat</th><th class="num">Kunjungan tercapai</th><th class="num">Benefit terlambat</th></tr></thead><tbody>
    ${K.sort((a, b) => b.mrr - a.mrr).map((r) => `<tr><td>${esc(r.cabang)}</td><td class="num">${r.mitra_aktif}</td><td class="num">${rp(r.mrr)}</td><td class="num">${r.unit_dimaintain}</td><td class="num">${r.collection_rate_bulan_ini ?? "-"}${r.collection_rate_bulan_ini != null ? "%" : ""}</td><td class="num" style="color:${+r.piutang_terlambat ? "var(--bad)" : "inherit"}">${rp(r.piutang_terlambat)}</td><td class="num">${r.kunjungan_tercapai_pct ?? "-"}${r.kunjungan_tercapai_pct != null ? "%" : ""}</td><td class="num">${r.benefit_terlambat}</td></tr>`).join("")}
  </tbody></table></div></div>` : ""}`;

  $$("[data-wa]").forEach((b) => (b.onclick = () => { const r = JSON.parse(b.dataset.wa); kirimWA(r.jenis, r); }));

  const css = getComputedStyle(document.documentElement);
  const c1 = css.getPropertyValue("--s1").trim(), c2 = css.getPropertyValue("--s2").trim();
  const grid = css.getPropertyValue("--line").trim(), ink = css.getPropertyValue("--ink-2").trim();
  const base = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${rp(c.parsed.y)}` } } },
    scales: { x: { grid: { display: false }, ticks: { color: ink } }, y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: ink, callback: (v) => rpJt(v).replace("Rp ", "") } } },
  };
  const labels = bulan.map(blnLabel);
  charts.push(new Chart($("#c1"), { type: "bar", data: { labels, datasets: [
    { label: "Ditagih", data: agg("ditagih"), backgroundColor: c1, borderRadius: 4, borderSkipped: "start", maxBarThickness: 22 },
    { label: "Terbayar", data: agg("terbayar"), backgroundColor: c2, borderRadius: 4, borderSkipped: "start", maxBarThickness: 22 },
  ] }, options: { ...base, datasets: { bar: { categoryPercentage: 0.6, barPercentage: 0.9 } } } }));
  charts.push(new Chart($("#c2"), { type: "line", data: { labels, datasets: [
    { label: "Gross profit", data: agg("gross_profit"), borderColor: c1, backgroundColor: c1, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0.25 },
  ] }, options: base }));
};
const labelJenis = (j) => ({ tagihan: "Tagihan", kunjungan: "Kunjungan", benefit: "Benefit", akad_habis: "Akad berakhir" }[j] || j);

/* ---------- PENGINGAT ---------- */
VIEWS.pengingat = async () => {
  const rows = cek(await q("v_pengingat").order("sisa_hari"));
  const ids = rows.map((r) => r.ref_id);
  const logs = ids.length ? cek(await sb.from("log_pengingat").select("ref_id,channel,dikirim_at").in("ref_id", ids).order("dikirim_at", { ascending: false })) : [];
  const terakhir = {}; logs.forEach((l) => { terakhir[l.ref_id] ??= l; });
  let tab = "semua";
  const draw = () => {
    const list = rows.filter((r) => tab === "semua" || r.jenis === tab);
    const n = (j) => rows.filter((r) => j === "semua" || r.jenis === j).length;
    $("#view").innerHTML = `
    <div class="tabs">${["semua", "tagihan", "kunjungan", "benefit", "akad_habis"].map((j) => `<button data-t="${j}" class="${tab === j ? "on" : ""}">${j === "semua" ? "Semua" : labelJenis(j)} (${n(j)})</button>`).join("")}</div>
    <p class="muted" style="margin:0">Menampilkan semua yang jatuh tempo dalam 7 hari ke depan dan yang sudah terlambat. Email terkirim otomatis tiap pagi; tombol WhatsApp membuka pesan yang sudah terisi.</p>
    <div class="tbl-wrap">${list.length ? `<table><thead><tr><th>Jenis</th><th>Pelanggan</th>${isAdmin() ? "<th>Cabang</th>" : ""}<th>Tanggal</th><th class="num">Nominal</th><th>Status</th><th>Terakhir diingatkan</th><th></th></tr></thead><tbody>
      ${list.map((r, i) => { const l = terakhir[r.ref_id]; return `<tr><td>${labelJenis(r.jenis)}</td><td>${esc(r.pelanggan)}<small>${esc(r.nama_pic || "")} · ${esc(r.no_wa || "tanpa WA")}</small></td>${isAdmin() ? `<td>${esc(r.cabang)}</td>` : ""}<td>${tgl(r.tanggal)}<small>${esc(r.nomor_akad)}</small></td><td class="num">${r.nominal ? rp(r.nominal) : "-"}</td><td>${hariBadge(r.sisa_hari)}</td><td>${l ? `${l.channel === "email" ? "Email" : "WA"} · ${tgl(l.dikirim_at)}` : `<span class="muted">Belum</span>`}</td>
      <td class="act"><button class="btn wa sm" data-i="${i}">WhatsApp</button> <a class="btn sm" href="#/${r.jenis === "akad_habis" ? "akad/" + r.ref_id : r.jenis}">Buka</a></td></tr>`; }).join("")}
    </tbody></table>` : `<div class="empty">Tidak ada pengingat.</div>`}</div>`;
    $$(".tabs button").forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
    $$("[data-i]").forEach((b) => (b.onclick = async () => { const r = list[+b.dataset.i]; await kirimWA(r.jenis, r); terakhir[r.ref_id] = { channel: "whatsapp", dikirim_at: new Date().toISOString() }; draw(); }));
  };
  draw();
};

/* ---------- PELANGGAN ---------- */
VIEWS.pelanggan = async () => {
  const rows = cek(await q("pelanggan", "*, akad(status)").order("nama"));
  let cari = "";
  const draw = () => {
    const list = rows.filter((r) => !cari || (r.nama + r.nama_pic + r.no_wa).toLowerCase().includes(cari));
    $("#view").innerHTML = `<div class="toolbar"><input class="grow" id="cari" placeholder="Cari nama, PIC, atau WA" value="${esc(cari)}"><button class="btn primary" id="baru">+ Pelanggan</button></div>
    <div class="tbl-wrap">${list.length ? `<table><thead><tr><th>Pelanggan</th><th>PIC</th><th>Kontak</th>${isAdmin() ? "<th>Cabang</th>" : ""}<th>Akad aktif</th><th></th></tr></thead><tbody>
    ${list.map((r) => `<tr><td><b>${esc(r.nama)}</b><small>${esc(r.alamat || "")}</small></td><td>${esc(r.nama_pic || "-")}<small>${esc(r.jabatan_pic || "")}</small></td><td>${esc(r.no_wa || "-")}<small>${esc(r.email || "")}</small></td>${isAdmin() ? `<td>${esc(cabangNama(r.cabang_id))}</td>` : ""}<td>${r.akad.filter((a) => a.status === "aktif").length}</td>
    <td class="act"><button class="btn sm" data-e="${r.id}">Ubah</button> <a class="btn sm primary" href="#/akad" data-akad="${r.id}">+ Akad</a>${btnHapus("pelanggan", r.id, "pelanggan " + r.nama)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">Belum ada pelanggan.</div>`}</div>`;
    const c = $("#cari"); c.oninput = () => { cari = c.value.toLowerCase(); draw(); $("#cari").focus(); $("#cari").setSelectionRange(99, 99); };
    $("#baru").onclick = () => formPelanggan();
    $$("[data-e]").forEach((b) => (b.onclick = () => formPelanggan(rows.find((r) => r.id === b.dataset.e))));
    pasangHapus(router);
    $$("[data-akad]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); formAkad(b.dataset.akad); }));
  };
  draw();
};
function formPelanggan(r = {}, after) {
  modal(r.id ? "Ubah pelanggan" : "Pelanggan baru", `<form class="form" id="f">
    ${cabangSelect("cabang_id", r.cabang_id)}
    <label>Nama perusahaan / pelanggan<input name="nama" required value="${esc(r.nama)}"></label>
    <label>Nama PIC<input name="nama_pic" value="${esc(r.nama_pic)}"></label>
    <label>Jabatan PIC<input name="jabatan_pic" value="${esc(r.jabatan_pic)}"></label>
    <label>No. WhatsApp<input name="no_wa" placeholder="0812xxxx" value="${esc(r.no_wa)}"></label>
    <label>Email (untuk pengingat otomatis)<input type="email" name="email" value="${esc(r.email)}"></label>
    <label>NPWP<input name="npwp" value="${esc(r.npwp)}"></label>
    <label class="full">Alamat<textarea name="alamat" rows="2">${esc(r.alamat)}</textarea></label>
    <div class="form-actions"><button type="button" class="btn" onclick="tutupModal()">Batal</button><button class="btn primary">Simpan</button></div></form>`, (el) => {
    $("#f", el).onsubmit = async (e) => {
      e.preventDefault(); const v = fd(e.target); v.cabang_id = +v.cabang_id;
      const res = r.id ? await sb.from("pelanggan").update(v).eq("id", r.id).select().single() : await sb.from("pelanggan").insert(v).select().single();
      const row = cek(res); tutupModal(); toast("Pelanggan tersimpan");
      after ? after(row) : router();
    };
  });
}

/* ---------- AKAD ---------- */
VIEWS.akad = async (id) => {
  if (id) return detailAkad(id);
  const rows = cek(await q("akad", "*, pelanggan(nama,nama_pic)").order("created_at", { ascending: false }));
  let st = "";
  const draw = () => {
    const list = rows.filter((r) => !st || r.status === st);
    $("#view").innerHTML = `<div class="toolbar"><select id="st"><option value="">Semua status</option>${["menunggu_ttd", "aktif", "ditangguhkan", "berakhir", "batal"].map((s) => `<option ${s === st ? "selected" : ""} value="${s}">${s.replace("_", " ")}</option>`).join("")}</select><span class="spacer"></span><button class="btn primary" id="baru">+ Akad baru</button></div>
    <div class="tbl-wrap">${list.length ? `<table><thead><tr><th>No. Akad</th><th>Pelanggan</th>${isAdmin() ? "<th>Cabang</th>" : ""}<th class="num">Unit</th><th class="num">Per bulan</th><th>Masa berlaku</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map((r) => `<tr><td><b>${esc(r.nomor)}</b></td><td>${esc(r.pelanggan?.nama)}<small>${esc(r.pelanggan?.nama_pic || "")}</small></td>${isAdmin() ? `<td>${esc(cabangNama(r.cabang_id))}</td>` : ""}<td class="num">${r.jumlah_unit}</td><td class="num">${rp(r.harga_bulanan)}</td><td>${tgl(r.tgl_mulai)} – ${tgl(r.tgl_selesai)}<small>${r.durasi_bulan} bulan${r.perpanjang_otomatis ? " · perpanjang otomatis" : ""}</small></td><td>${stBadge(r.status)}</td><td class="act"><a class="btn sm" href="#/akad/${r.id}">${r.status === "menunggu_ttd" ? "Tanda tangan" : "Buka"}</a>${btnHapus("akad", r.id, "akad " + r.nomor + " (" + (r.pelanggan?.nama || "") + ")")}</td></tr>`).join("")}
    </tbody></table>` : `<div class="empty">Belum ada akad.</div>`}</div>`;
    $("#st").onchange = (e) => { st = e.target.value; draw(); };
    $("#baru").onclick = () => formAkad();
    pasangHapus(router);
  };
  draw();
};

async function formAkad(pelangganId = "") {
  if (!S.paket) return toast("Super Admin perlu mengisi harga paket di Pengaturan dulu.", true);
  const pel = cek(await q("pelanggan", "id,nama,cabang_id").order("nama"));
  const P = S.paket;
  modal("Akad langganan baru", `<form class="form" id="f">
    <label class="full">Pelanggan<div class="row"><select name="pelanggan_id" required style="flex:1"><option value="">Pilih pelanggan</option>${pel.map((p) => `<option value="${p.id}" data-c="${p.cabang_id}" ${p.id === pelangganId ? "selected" : ""}>${esc(p.nama)}${isAdmin() ? " — " + esc(cabangNama(p.cabang_id)) : ""}</option>`).join("")}</select><button type="button" class="btn" id="pelBaru">+ Baru</button></div></label>
    <label>Tanggal mulai<input type="date" name="tgl_mulai" required value="${today()}"></label>
    <label>Durasi (bulan)<input type="number" name="durasi_bulan" min="${P.durasi_min_bulan}" value="${P.durasi_min_bulan}" required></label>
    <label>Tanggal jatuh tempo tiap bulan<input type="number" name="tgl_tagih" min="1" max="28" value="10" required></label>
    <label>Biaya langganan / bulan (Rp)<input type="number" name="harga_bulanan" id="harga" min="0" step="1000" required value="${P.harga_bulanan}"></label>
    <label class="chk full"><input type="checkbox" name="perpanjang_otomatis" checked> Perpanjang otomatis 12 bulan bila tidak dihentikan</label>
    <div class="full units-edit"><div class="row" style="justify-content:space-between;margin-bottom:6px"><b>Unit / mesin yang di-maintain</b><button type="button" class="btn sm" id="addU">+ Unit</button></div><div id="units"></div>
      <small class="muted">Harga paket standar: ${rp(P.harga_bulanan)} per unit per bulan, ${P.kunjungan_per_bulan}× kunjungan per bulan.</small></div>
    <label class="full">Catatan<textarea name="catatan" rows="2"></textarea></label>
    <div class="form-actions"><button type="button" class="btn" onclick="tutupModal()">Batal</button><button class="btn primary">Buat akad &amp; lanjut tanda tangan</button></div></form>`, (el) => {
    const units = $("#units", el), harga = $("#harga", el);
    let hargaDiubah = false; harga.oninput = () => (hargaDiubah = true);
    const addU = () => {
      const d = document.createElement("div"); d.className = "u";
      d.innerHTML = `<input placeholder="Merk" name="u_merk"><input placeholder="Tipe" name="u_tipe"><input placeholder="No. seri" name="u_seri"><input placeholder="Lokasi" name="u_lokasi"><button type="button" class="btn sm danger" aria-label="Hapus unit">×</button>`;
      d.querySelector("button").onclick = () => { if (units.children.length > 1) { d.remove(); upd(); } };
      units.append(d); upd();
    };
    const upd = () => { if (!hargaDiubah) harga.value = P.harga_bulanan * units.children.length; };
    $("#addU", el).onclick = addU; addU();
    $("#pelBaru", el).onclick = () => formPelanggan({}, (row) => formAkad(row.id));
    $("#f", el).onsubmit = async (e) => {
      e.preventDefault(); const f = e.target; const v = fd(f);
      const sel = f.pelanggan_id.selectedOptions[0];
      const unitRows = $$(".u", units).map((u) => ({ merk: u.children[0].value, tipe: u.children[1].value, no_seri: u.children[2].value, lokasi: u.children[3].value }));
      const ak = cek(await sb.from("akad").insert({
        pelanggan_id: v.pelanggan_id, cabang_id: +sel.dataset.c, paket_id: P.id, jumlah_unit: unitRows.length,
        harga_bulanan: +v.harga_bulanan, tgl_mulai: v.tgl_mulai, durasi_bulan: +v.durasi_bulan, tgl_tagih: +v.tgl_tagih,
        perpanjang_otomatis: !!v.perpanjang_otomatis, status: "menunggu_ttd", catatan: v.catatan || null,
      }).select().single());
      cek(await sb.from("akad_unit").insert(unitRows.map((u) => ({ ...u, akad_id: ak.id }))));
      tutupModal(); location.hash = "#/akad/" + ak.id;
    };
  });
}

/* isi pasal akad — dipakai untuk tampilan layar & PDF */
function pasalAkad(ak, pl, units) {
  const pt = setting("nama_perusahaan", "MFlash");
  const P = S.paket || {};
  const ben = S.benefit.filter((b) => b.aktif);
  const frek = { bulanan: "setiap bulan", triwulan: "setiap 3 bulan", semester: "setiap 6 bulan", tahunan: "setiap tahun", sekali: "satu kali di awal masa langganan" };
  return [
    ["Pasal 1 — Objek Perjanjian", [`${pt} ("Penyedia") memberikan layanan maintenance dan service berkala atas ${units.length} unit milik ${pl.nama} ("Pelanggan") sebagaimana tercantum dalam Lampiran Unit.`]],
    ["Pasal 2 — Biaya Langganan dan Pembayaran", [
      `Biaya langganan sebesar ${rp(ak.harga_bulanan)} per bulan.`,
      `Tagihan diterbitkan setiap bulan dan wajib dibayar paling lambat tanggal ${ak.tgl_tagih} bulan berjalan ke rekening ${setting("rekening_pembayaran", "yang ditunjuk Penyedia")}.`,
      `Keterlambatan pembayaran lebih dari 14 hari memberi hak kepada Penyedia untuk menangguhkan layanan sampai tagihan dilunasi.`]],
    ["Pasal 3 — Kunjungan Maintenance", [
      `Penyedia melakukan ${P.kunjungan_per_bulan || 1} kali kunjungan maintenance setiap bulan pada jadwal yang disepakati.`,
      `Setiap kunjungan dituangkan dalam berita acara yang ditandatangani Pelanggan.`,
      `Penggantian suku cadang di luar cakupan paket ditagihkan terpisah setelah disetujui Pelanggan.`]],
    ["Pasal 4 — Benefit Pelanggan (Kewajiban Penyedia)", ben.length ? ben.map((b) => `${b.nama}${b.deskripsi ? " — " + b.deskripsi : ""} (${frek[b.frekuensi]}).`) : ["Sesuai ketentuan paket yang berlaku."]],
    ["Pasal 5 — Jangka Waktu", [
      `Perjanjian berlaku ${ak.durasi_bulan} bulan, terhitung ${tglP(ak.tgl_mulai)} sampai ${tglP(ak.tgl_selesai)}.`,
      ak.perpanjang_otomatis ? `Perjanjian diperpanjang otomatis masing-masing 12 bulan, kecuali salah satu pihak memberitahukan penghentian secara tertulis paling lambat 30 hari sebelum berakhir.` : `Perjanjian berakhir pada tanggal tersebut dan dapat diperpanjang dengan akad baru.`]],
    ["Pasal 6 — Pengakhiran", [`Masing-masing pihak dapat mengakhiri perjanjian dengan pemberitahuan tertulis 30 hari sebelumnya. Kewajiban pembayaran yang telah jatuh tempo tetap harus diselesaikan.`]],
    ["Pasal 7 — Tanda Tangan Elektronik", [`Para pihak sepakat bahwa perjanjian ini ditandatangani secara elektronik dan memiliki kekuatan hukum yang sama dengan tanda tangan basah.`]],
  ];
}

async function detailAkad(id) {
  const ak = cek(await sb.from("akad").select("*, pelanggan(*), akad_unit(*)").eq("id", id).single());
  const pl = ak.pelanggan, units = ak.akad_unit;
  const pasal = pasalAkad(ak, pl, units);
  const [tg, ku, kb] = await Promise.all([
    sb.from("tagihan").select("*").eq("akad_id", id).order("periode"),
    sb.from("kunjungan").select("*").eq("akad_id", id).order("jadwal"),
    sb.from("kewajiban_benefit").select("*, benefit(nama)").eq("akad_id", id).order("periode"),
  ]);
  const [urlP, urlM, urlPdf] = await Promise.all([signedUrl(ak.ttd_pelanggan_url), signedUrl(ak.ttd_mflash_url), signedUrl(ak.pdf_url)]);
  const perluTtd = ak.status === "menunggu_ttd" || ak.status === "draft";
  $("#pageTitle").textContent = "Akad " + ak.nomor;
  $("#view").innerHTML = `
  <div class="row"><a class="btn sm" href="#/akad">← Semua akad</a><span class="spacer"></span>${stBadge(ak.status)}
    ${urlPdf ? `<a class="btn sm" href="${urlPdf}" target="_blank">Unduh PDF akad</a>` : ""}
    ${ak.status === "aktif" ? `<button class="btn sm" data-s="ditangguhkan">Tangguhkan</button><button class="btn sm danger" data-s="berakhir">Akhiri</button>` : ""}
    ${ak.status === "ditangguhkan" ? `<button class="btn sm primary" data-s="aktif">Aktifkan kembali</button><button class="btn sm danger" data-s="berakhir">Akhiri</button>` : ""}
    ${perluTtd ? `<button class="btn sm danger" data-s="batal">Batalkan</button>` : ""}${btnHapus("akad", ak.id, "akad " + ak.nomor + " (" + pl.nama + ")")}
  </div>
  <div class="doc">
    <h1>PERJANJIAN BERLANGGANAN MAINTENANCE &amp; SERVICE</h1><div class="nomor">No. ${esc(ak.nomor)}</div>
    <dl class="kv"><dt>Penyedia</dt><dd>${esc(setting("nama_perusahaan", "MFlash"))} — Cabang ${esc(cabangNama(ak.cabang_id))}</dd>
      <dt>Pelanggan</dt><dd>${esc(pl.nama)}</dd><dt>Diwakili</dt><dd>${esc(pl.nama_pic || "-")}${pl.jabatan_pic ? ", " + esc(pl.jabatan_pic) : ""}</dd>
      <dt>Alamat</dt><dd>${esc(pl.alamat || "-")}</dd><dt>NPWP</dt><dd>${esc(pl.npwp || "-")}</dd></dl>
    ${pasal.map(([j, isi]) => `<h4>${esc(j)}</h4>${isi.length > 1 ? `<ol>${isi.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : `<p>${esc(isi[0])}</p>`}`).join("")}
    <h4>Lampiran Unit</h4>
    <div class="tbl-wrap"><table><thead><tr><th>#</th><th>Merk</th><th>Tipe</th><th>No. seri</th><th>Lokasi</th></tr></thead><tbody>${units.map((u, i) => `<tr><td>${i + 1}</td><td>${esc(u.merk || "-")}</td><td>${esc(u.tipe || "-")}</td><td>${esc(u.no_seri || "-")}</td><td>${esc(u.lokasi || "-")}</td></tr>`).join("")}</tbody></table></div>
    <div class="sig-row">
      <div class="sig"><b>Pelanggan</b>${perluTtd ? `<input id="namaTtd" placeholder="Nama penanda tangan" value="${esc(pl.nama_pic || "")}"><canvas id="padP"></canvas><button class="btn sm" id="clrP" type="button">Ulangi</button>` : `${urlP ? `<img src="${urlP}" alt="Tanda tangan pelanggan">` : ""}<div>${esc(ak.ttd_nama_penanda || "")}<small class="muted" style="display:block">${ak.ttd_pelanggan_at ? new Date(ak.ttd_pelanggan_at).toLocaleString("id-ID") : ""}</small></div>`}</div>
      <div class="sig"><b>${esc(setting("nama_perusahaan", "MFlash"))}</b>${perluTtd ? `<input disabled value="${esc(S.profil.nama)}"><canvas id="padM"></canvas><button class="btn sm" id="clrM" type="button">Ulangi</button>` : `${urlM ? `<img src="${urlM}" alt="Tanda tangan MFlash">` : ""}<div>${ak.ttd_mflash_at ? new Date(ak.ttd_mflash_at).toLocaleString("id-ID") : ""}</div>`}</div>
    </div>
    ${perluTtd ? `<label class="chk" style="margin-top:14px"><input type="checkbox" id="setuju"> Pelanggan telah membaca dan menyetujui seluruh isi perjanjian ini.</label>
      <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" id="ttdBtn">Tandatangani &amp; aktifkan langganan</button></div>` : ""}
  </div>
  ${!perluTtd ? `<div class="grid2">
    <div class="card"><h3>Tagihan</h3>${miniTable(tg.data, ["periode", "jatuh_tempo", "nominal", "status"])}</div>
    <div class="card"><h3>Kunjungan</h3>${miniTable(ku.data, ["jadwal", "teknisi", "status"])}</div>
  </div><div class="card"><h3>Benefit</h3>${miniTable((kb.data || []).map((r) => ({ ...r, nama: r.benefit?.nama })), ["periode", "nama", "batas_waktu", "status"])}</div>` : ""}`;

  pasangHapus(() => (location.hash = "#/akad"));
  $$("[data-s]").forEach((b) => (b.onclick = async () => {
    const s = b.dataset.s;
    if (!confirm(`Ubah status akad menjadi "${s}"? ${s !== "aktif" ? "Tagihan, kunjungan, dan benefit ke depan yang belum berjalan akan dibatalkan." : ""}`)) return;
    cek(await sb.from("akad").update({ status: s }).eq("id", id)); toast("Status akad diperbarui"); router();
  }));

  if (perluTtd) {
    const pP = sigPad($("#padP")), pM = sigPad($("#padM"));
    $("#clrP").onclick = () => pP.clear(); $("#clrM").onclick = () => pM.clear();
    $("#ttdBtn").onclick = async () => {
      const nama = $("#namaTtd").value.trim();
      if (!nama) return toast("Isi nama penanda tangan pelanggan", true);
      if (pP.isEmpty() || pM.isEmpty()) return toast("Kedua tanda tangan wajib diisi", true);
      if (!$("#setuju").checked) return toast("Centang persetujuan pelanggan dulu", true);
      const btn = $("#ttdBtn"); btn.disabled = true; btn.textContent = "Menyimpan…";
      try {
        const now = new Date().toISOString();
        const imgP = pP.toDataURL("image/png"), imgM = pM.toDataURL("image/png");
        const dir = `${ak.cabang_id}/akad/${ak.id}`;
        const [fp, fm] = await Promise.all([
          upload(`${dir}/ttd_pelanggan.png`, await dataUrlToBlob(imgP), "image/png"),
          upload(`${dir}/ttd_mflash.png`, await dataUrlToBlob(imgM), "image/png"),
        ]);
        const final = { ...ak, ttd_nama_penanda: nama, ttd_pelanggan_at: now, ttd_mflash_at: now };
        const pdf = buatPdfAkad(final, pl, units, pasal, imgP, imgM);
        const fpdf = await upload(`${dir}/akad_${ak.nomor.replace(/\//g, "-")}.pdf`, pdf, "application/pdf");
        cek(await sb.from("akad").update({
          ttd_pelanggan_url: fp, ttd_nama_penanda: nama, ttd_pelanggan_at: now,
          ttd_mflash_url: fm, ttd_mflash_oleh: S.user.id, ttd_mflash_at: now, pdf_url: fpdf, status: "aktif",
        }).eq("id", id));
        toast("Akad aktif. Tagihan dan jadwal kunjungan sudah dibuat."); router();
      } catch (e) { btn.disabled = false; btn.textContent = "Tandatangani & aktifkan langganan"; }
    };
  }
}
/* tombol Hapus per transaksi — hanya tampil untuk Super Admin (database juga menolak selain Super Admin) */
const HAPUS_INFO = {
  pelanggan: "Semua akad, tagihan, kunjungan, dan benefit milik pelanggan ini IKUT TERHAPUS.",
  akad: "Semua tagihan, kunjungan, dan benefit dari akad ini IKUT TERHAPUS.",
};
const btnHapus = (tabel, id, nama) => (isAdmin() ? ` <button class="btn sm danger" data-del="${tabel}" data-id="${id}" data-nm="${esc(nama)}">Hapus</button>` : "");
function pasangHapus(after) {
  $$("[data-del]").forEach((b) => (b.onclick = async () => {
    const t = b.dataset.del, info = HAPUS_INFO[t] ? "\n\n" + HAPUS_INFO[t] : "";
    if (!confirm(`Hapus ${b.dataset.nm}?${info}\n\nData yang dihapus tidak bisa dikembalikan.`)) return;
    b.disabled = true;
    const { data, error } = await sb.from(t).delete().eq("id", b.dataset.id).select("id");
    if (error || !data?.length) { b.disabled = false; return toast(error ? error.message : "Gagal menghapus: hanya Super Admin yang boleh menghapus.", true); }
    toast("Data terhapus"); await hitungPengingat(); renderNav(location.hash.replace(/^#\//, "").split("/")[0] || "dashboard", S.jumlahPengingat);
    after();
  }));
}
function miniTable(rows, cols) {
  if (!rows?.length) return `<div class="empty">Belum ada data.</div>`;
  const fmt = (k, v) => (k === "status" ? stBadge(v) : k === "nominal" ? rp(v) : /periode/.test(k) ? blnLabel(v) : /jadwal|jatuh|batas/.test(k) ? tgl(v) : esc(v ?? "-"));
  const lbl = { periode: "Periode", jatuh_tempo: "Jatuh tempo", nominal: "Nominal", status: "Status", jadwal: "Jadwal", teknisi: "Teknisi", nama: "Benefit", batas_waktu: "Batas" };
  return `<div class="tbl-wrap"><table><thead><tr>${cols.map((c) => `<th class="${c === "nominal" ? "num" : ""}">${lbl[c]}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c === "nominal" ? "num" : ""}">${fmt(c, r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function buatPdfAkad(ak, pl, units, pasal, imgP, imgM) {
  const { jsPDF } = window.jspdf; const d = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 20, CW = W - 2 * M; let y = 20;
  const need = (h) => { if (y + h > 280) { d.addPage(); y = 20; } };
  const para = (t, size = 10, style = "normal", indent = 0) => {
    d.setFont("helvetica", style); d.setFontSize(size);
    d.splitTextToSize(t, CW - indent).forEach((ln) => { need(5); d.text(ln, M + indent, y); y += size * 0.45 + 1; });
  };
  d.setFont("helvetica", "bold"); d.setFontSize(13);
  d.text("PERJANJIAN BERLANGGANAN MAINTENANCE & SERVICE", W / 2, y, { align: "center" }); y += 6;
  d.setFont("helvetica", "normal"); d.setFontSize(10); d.text("No. " + ak.nomor, W / 2, y, { align: "center" }); y += 10;
  [["Penyedia", `${setting("nama_perusahaan", "MFlash")} — Cabang ${cabangNama(ak.cabang_id)}`], ["Pelanggan", pl.nama], ["Diwakili", `${ak.ttd_nama_penanda}${pl.jabatan_pic ? ", " + pl.jabatan_pic : ""}`], ["Alamat", pl.alamat || "-"], ["NPWP", pl.npwp || "-"]]
    .forEach(([k, v]) => { d.setFont("helvetica", "normal"); d.text(k, M, y); d.setFont("helvetica", "bold"); const l = d.splitTextToSize(v, CW - 35); d.text(l, M + 35, y); y += 5 * l.length; });
  y += 3;
  pasal.forEach(([j, isi]) => { y += 2; need(12); para(j, 10.5, "bold"); isi.forEach((x, i) => para((isi.length > 1 ? `${i + 1}. ` : "") + x, 10, "normal", isi.length > 1 ? 3 : 0)); });
  y += 3; need(12); para("Lampiran Unit", 10.5, "bold");
  units.forEach((u, i) => para(`${i + 1}. ${[u.merk, u.tipe].filter(Boolean).join(" ") || "Unit"} — No. seri: ${u.no_seri || "-"} — Lokasi: ${u.lokasi || "-"}`, 9.5, "normal", 3));
  y += 8; need(55);
  const col = (x, judul, img, nama, waktu) => {
    d.setFont("helvetica", "bold"); d.setFontSize(10); d.text(judul, x, y);
    d.addImage(img, "PNG", x, y + 3, 60, 28);
    d.setFont("helvetica", "normal"); d.text(nama, x, y + 37); d.setFontSize(8); d.text(waktu, x, y + 42);
  };
  const w = new Date(ak.ttd_pelanggan_at).toLocaleString("id-ID");
  col(M, "Pelanggan", imgP, ak.ttd_nama_penanda, "Ditandatangani elektronik " + w);
  col(W / 2 + 5, setting("nama_perusahaan", "MFlash"), imgM, S.profil.nama, "Ditandatangani elektronik " + w);
  return d.output("blob");
}

/* ---------- TAGIHAN ---------- */
VIEWS.tagihan = async () => {
  let per = bulanIni(), st = "";
  const draw = async () => {
    let x = q("tagihan", "*, akad(nomor, pelanggan(nama,nama_pic,no_wa))").order("jatuh_tempo");
    if (per) x = x.eq("periode", per);
    if (st === "terlambat") x = x.eq("status", "belum_bayar").lt("jatuh_tempo", today()); else if (st) x = x.eq("status", st);
    const rows = cek(await x);
    const tot = (f) => rows.filter(f).reduce((a, r) => a + Number(r.nominal), 0);
    $("#view").innerHTML = `<div class="toolbar"><input type="month" id="per" value="${per.slice(0, 7)}"><button class="btn sm" id="semua">Semua bulan</button>
      <select id="st"><option value="">Semua status</option>${[["belum_bayar", "Belum bayar"], ["terlambat", "Terlambat"], ["lunas", "Lunas"], ["batal", "Batal"]].map(([v, l]) => `<option value="${v}" ${v === st ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="kpis"><div class="kpi"><div class="lbl">Total ditagih</div><div class="val">${rpJt(tot((r) => r.status !== "batal"))}</div></div>
      <div class="kpi"><div class="lbl">Lunas</div><div class="val">${rpJt(tot((r) => r.status === "lunas"))}</div></div>
      <div class="kpi"><div class="lbl">Belum bayar</div><div class="val">${rpJt(tot((r) => r.status === "belum_bayar"))}</div></div></div>
    <div class="tbl-wrap">${rows.length ? `<table><thead><tr><th>No. tagihan</th><th>Pelanggan</th>${isAdmin() ? "<th>Cabang</th>" : ""}<th>Periode</th><th>Jatuh tempo</th><th class="num">Nominal</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((r, i) => { const h = Math.round((new Date(r.jatuh_tempo) - new Date(today())) / 864e5); return `<tr><td>${esc(r.nomor)}<small>${esc(r.akad?.nomor)}</small></td><td>${esc(r.akad?.pelanggan?.nama)}</td>${isAdmin() ? `<td>${esc(cabangNama(r.cabang_id))}</td>` : ""}<td>${blnLabel(r.periode)}</td><td>${tgl(r.jatuh_tempo)}${r.status === "belum_bayar" && h <= 7 ? "<br>" + hariBadge(h) : ""}</td><td class="num">${rp(r.nominal)}</td><td>${stBadge(r.status)}${r.tgl_bayar ? `<small>${tgl(r.tgl_bayar)} · ${esc(r.metode_bayar || "")}</small>` : ""}</td>
      <td class="act">${r.status === "belum_bayar" ? `<button class="btn sm wa" data-wa="${i}">WA</button> <button class="btn sm primary" data-lunas="${i}">Tandai lunas</button>` : r.bukti_url ? `<button class="btn sm" data-bukti="${i}">Bukti</button>` : ""}${btnHapus("tagihan", r.id, "tagihan " + r.nomor + " (" + (r.akad?.pelanggan?.nama || "") + ")")}</td></tr>`; }).join("")}
    </tbody></table>` : `<div class="empty">Tidak ada tagihan.</div>`}</div>`;
    $("#per").onchange = (e) => { per = e.target.value ? e.target.value + "-01" : ""; draw(); };
    $("#semua").onclick = () => { per = ""; draw(); };
    $("#st").onchange = (e) => { st = e.target.value; draw(); };
    pasangHapus(draw);
    $$("[data-wa]").forEach((b) => (b.onclick = () => { const r = rows[+b.dataset.wa]; kirimWA("tagihan", { ref_id: r.id, pelanggan: r.akad.pelanggan.nama, nama_pic: r.akad.pelanggan.nama_pic, no_wa: r.akad.pelanggan.no_wa, nomor_akad: r.akad.nomor, nominal: r.nominal, tanggal: r.jatuh_tempo, cabang: cabangNama(r.cabang_id), sisa_hari: Math.round((new Date(r.jatuh_tempo) - new Date(today())) / 864e5) }); }));
    $$("[data-bukti]").forEach((b) => (b.onclick = async () => window.open(await signedUrl(rows[+b.dataset.bukti].bukti_url), "_blank")));
    $$("[data-lunas]").forEach((b) => (b.onclick = () => {
      const r = rows[+b.dataset.lunas];
      modal("Catat pembayaran", `<p><b>${esc(r.akad.pelanggan.nama)}</b> — ${esc(r.nomor)} — ${rp(r.nominal)}</p><form class="form" id="f">
        <label>Tanggal bayar<input type="date" name="tgl_bayar" value="${today()}" required></label>
        <label>Metode<select name="metode_bayar"><option>Transfer</option><option>Tunai</option><option>Giro</option><option>Lainnya</option></select></label>
        <label class="full">Bukti bayar (foto/PDF, opsional)<input type="file" name="bukti" accept="image/*,application/pdf"></label>
        <div class="form-actions"><button type="button" class="btn" onclick="tutupModal()">Batal</button><button class="btn primary">Simpan lunas</button></div></form>`, (el) => {
        $("#f", el).onsubmit = async (e) => {
          e.preventDefault(); const f = e.target; const file = f.bukti.files[0];
          const upd = { status: "lunas", tgl_bayar: f.tgl_bayar.value, metode_bayar: f.metode_bayar.value };
          if (file) upd.bukti_url = await upload(`${r.cabang_id}/tagihan/${r.id}/${Date.now()}_${file.name}`, file, file.type);
          cek(await sb.from("tagihan").update(upd).eq("id", r.id)); tutupModal(); toast("Pembayaran tercatat"); hitungPengingat(); draw();
        };
      });
    }));
  };
  await draw();
};

/* ---------- KUNJUNGAN ---------- */
VIEWS.kunjungan = async () => {
  let per = bulanIni(), st = "";
  const draw = async () => {
    let x = q("kunjungan", "*, akad(nomor, pelanggan(nama,nama_pic,no_wa,alamat))").order("jadwal");
    if (per) x = x.eq("periode", per); if (st) x = x.eq("status", st);
    const rows = cek(await x);
    $("#view").innerHTML = `<div class="toolbar"><input type="month" id="per" value="${per.slice(0, 7)}"><button class="btn sm" id="semua">Semua bulan</button>
      <select id="st"><option value="">Semua status</option>${["terjadwal", "dijadwal_ulang", "selesai", "terlewat", "batal"].map((v) => `<option value="${v}" ${v === st ? "selected" : ""}>${v.replace("_", " ")}</option>`).join("")}</select></div>
    <div class="tbl-wrap">${rows.length ? `<table><thead><tr><th>Jadwal</th><th>Pelanggan</th>${isAdmin() ? "<th>Cabang</th>" : ""}<th>Teknisi</th><th>Status</th><th class="num">Biaya</th><th></th></tr></thead><tbody>
    ${rows.map((r, i) => { const h = Math.round((new Date(r.jadwal) - new Date(today())) / 864e5); const open = ["terjadwal", "dijadwal_ulang", "terlewat"].includes(r.status); return `<tr><td>${tgl(r.jadwal)}${open && h <= 7 ? "<br>" + hariBadge(h) : ""}<small>Kunjungan ke-${r.ke}</small></td><td>${esc(r.akad?.pelanggan?.nama)}<small>${esc(r.akad?.pelanggan?.alamat || "")}</small></td>${isAdmin() ? `<td>${esc(cabangNama(r.cabang_id))}</td>` : ""}<td>${esc(r.teknisi || "-")}</td><td>${stBadge(r.status)}${r.tgl_realisasi ? `<small>${tgl(r.tgl_realisasi)}</small>` : ""}</td><td class="num">${r.biaya ? rp(r.biaya) : "-"}</td>
      <td class="act">${open ? `<button class="btn sm wa" data-wa="${i}">WA</button> <button class="btn sm" data-ulang="${i}">Jadwal ulang</button> <button class="btn sm primary" data-done="${i}">Selesai</button>` : r.status === "selesai" ? `<button class="btn sm" data-lihat="${i}">Laporan</button>` : ""}${btnHapus("kunjungan", r.id, "kunjungan " + tgl(r.jadwal) + " (" + (r.akad?.pelanggan?.nama || "") + ")")}</td></tr>`; }).join("")}
    </tbody></table>` : `<div class="empty">Tidak ada kunjungan.</div>`}</div>`;
    $("#per").onchange = (e) => { per = e.target.value ? e.target.value + "-01" : ""; draw(); };
    $("#semua").onclick = () => { per = ""; draw(); };
    $("#st").onchange = (e) => { st = e.target.value; draw(); };
    pasangHapus(draw);
    $$("[data-wa]").forEach((b) => (b.onclick = () => { const r = rows[+b.dataset.wa]; kirimWA("kunjungan", { ref_id: r.id, pelanggan: r.akad.pelanggan.nama, nama_pic: r.akad.pelanggan.nama_pic, no_wa: r.akad.pelanggan.no_wa, nomor_akad: r.akad.nomor, tanggal: r.jadwal, cabang: cabangNama(r.cabang_id), sisa_hari: Math.round((new Date(r.jadwal) - new Date(today())) / 864e5) }); }));
    $$("[data-ulang]").forEach((b) => (b.onclick = () => {
      const r = rows[+b.dataset.ulang];
      modal("Jadwal ulang kunjungan", `<form class="form" id="f"><label>Tanggal baru<input type="date" name="jadwal" value="${r.jadwal}" required></label><label>Teknisi<input name="teknisi" value="${esc(r.teknisi)}"></label>
        <div class="form-actions"><button type="button" class="btn" onclick="tutupModal()">Batal</button><button class="btn primary">Simpan</button></div></form>`, (el) => {
        $("#f", el).onsubmit = async (e) => { e.preventDefault(); const v = fd(e.target); cek(await sb.from("kunjungan").update({ ...v, status: "dijadwal_ulang" }).eq("id", r.id)); tutupModal(); toast("Jadwal diperbarui"); draw(); };
      });
    }));
    $$("[data-done]").forEach((b) => (b.onclick = () => {
      const r = rows[+b.dataset.done];
      modal("Laporan kunjungan", `<p><b>${esc(r.akad.pelanggan.nama)}</b> — ${esc(r.akad.nomor)}</p><form class="form" id="f">
        <label>Tanggal kunjungan<input type="date" name="tgl_realisasi" value="${today()}" required></label>
        <label>Teknisi<input name="teknisi" value="${esc(r.teknisi)}" required></label>
        <label class="full">Temuan<textarea name="temuan" rows="2"></textarea></label>
        <label class="full">Tindakan<textarea name="tindakan" rows="2"></textarea></label>
        <label>Biaya teknisi + sparepart (Rp)<input type="number" name="biaya" min="0" step="1000" value="0"></label>
        <label>Foto (bisa lebih dari satu)<input type="file" name="foto" accept="image/*" multiple></label>
        <div class="sig full"><b>Tanda tangan pelanggan (berita acara)</b><canvas id="pad"></canvas><button class="btn sm" type="button" id="clr">Ulangi</button></div>
        <div class="form-actions"><button type="button" class="btn" onclick="tutupModal()">Batal</button><button class="btn primary">Simpan laporan</button></div></form>`, (el) => {
        const pad = sigPad($("#pad", el)); $("#clr", el).onclick = () => pad.clear();
        $("#f", el).onsubmit = async (e) => {
          e.preventDefault(); const f = e.target; const btn = $("button.primary", f); btn.disabled = true;
          try {
            const dir = `${r.cabang_id}/kunjungan/${r.id}`;
            const foto = await Promise.all([...f.foto.files].map((file, i) => upload(`${dir}/foto_${Date.now()}_${i}.${file.name.split(".").pop()}`, file, file.type)));
            const ttd = pad.isEmpty() ? null : await upload(`${dir}/ttd.png`, await dataUrlToBlob(pad.toDataURL("image/png")), "image/png");
            cek(await sb.from("kunjungan").update({ status: "selesai", tgl_realisasi: f.tgl_realisasi.value, teknisi: f.teknisi.value, temuan: f.temuan.value, tindakan: f.tindakan.value, biaya: +f.biaya.value || 0, foto_urls: foto.length ? foto : null, ttd_pelanggan_url: ttd }).eq("id", r.id));
            tutupModal(); toast("Kunjungan selesai"); hitungPengingat(); draw();
          } catch { btn.disabled = false; }
        };
      });
    }));
    $$("[data-lihat]").forEach((b) => (b.onclick = async () => {
      const r = rows[+b.dataset.lihat];
      const foto = await Promise.all((r.foto_urls || []).map(signedUrl)); const ttd = await signedUrl(r.ttd_pelanggan_url);
      modal("Laporan kunjungan", `<dl class="kv"><dt>Pelanggan</dt><dd>${esc(r.akad.pelanggan.nama)}</dd><dt>Tanggal</dt><dd>${tgl(r.tgl_realisasi)}</dd><dt>Teknisi</dt><dd>${esc(r.teknisi)}</dd><dt>Temuan</dt><dd>${esc(r.temuan || "-")}</dd><dt>Tindakan</dt><dd>${esc(r.tindakan || "-")}</dd><dt>Biaya</dt><dd>${rp(r.biaya)}</dd></dl>
        ${foto.length ? `<div class="row" style="margin-top:12px">${foto.map((u) => `<a href="${u}" target="_blank"><img src="${u}" style="width:120px;height:90px;object-fit:cover;border-radius:8px"></a>`).join("")}</div>` : ""}
        ${ttd ? `<p style="margin-top:12px"><b>Tanda tangan pelanggan</b><br><img src="${ttd}" style="max-height:100px"></p>` : ""}`);
    }));
  };
  await draw();
};

/* ---------- BENEFIT ---------- */
VIEWS.benefit = async () => {
  let per = bulanIni(), st = "belum";
  const draw = async () => {
    let x = q("kewajiban_benefit", "*, benefit(nama,deskripsi), akad(nomor, pelanggan(nama,nama_pic,no_wa))").order("batas_waktu");
    if (per) x = x.eq("periode", per); if (st) x = x.eq("status", st);
    const rows = cek(await x);
    $("#view").innerHTML = `<div class="toolbar"><input type="month" id="per" value="${per.slice(0, 7)}"><button class="btn sm" id="semua">Semua bulan</button>
      <select id="st"><option value="">Semua status</option>${[["belum", "Belum dipenuhi"], ["dipenuhi", "Dipenuhi"], ["batal", "Batal"]].map(([v, l]) => `<option value="${v}" ${v === st ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <p class="muted" style="margin:0">Benefit adalah kewajiban MFlash ke pelanggan sesuai akad. Setiap benefit harus dicatat saat dipenuhi agar tidak ada yang terlewat.</p>
    <div class="tbl-wrap">${rows.length ? `<table><thead><tr><th>Benefit</th><th>Pelanggan</th>${isAdmin() ? "<th>Cabang</th>" : ""}<th>Batas waktu</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((r, i) => { const h = Math.round((new Date(r.batas_waktu) - new Date(today())) / 864e5); return `<tr><td><b>${esc(r.benefit?.nama)}</b><small>${esc(r.benefit?.deskripsi || "")}</small></td><td>${esc(r.akad?.pelanggan?.nama)}<small>${esc(r.akad?.nomor)}</small></td>${isAdmin() ? `<td>${esc(cabangNama(r.cabang_id))}</td>` : ""}<td>${tgl(r.batas_waktu)}${r.status === "belum" && h <= 7 ? "<br>" + hariBadge(h) : ""}</td><td>${stBadge(r.status)}${r.tgl_dipenuhi ? `<small>${tgl(r.tgl_dipenuhi)}</small>` : ""}</td>
      <td class="act">${r.status === "belum" ? `<button class="btn sm wa" data-wa="${i}">WA</button> <button class="btn sm primary" data-ok="${i}">Tandai dipenuhi</button>` : ""}${btnHapus("kewajiban_benefit", r.id, "benefit " + (r.benefit?.nama || "") + " (" + (r.akad?.pelanggan?.nama || "") + ")")}</td></tr>`; }).join("")}
    </tbody></table>` : `<div class="empty">Tidak ada kewajiban benefit.</div>`}</div>`;
    $("#per").onchange = (e) => { per = e.target.value ? e.target.value + "-01" : ""; draw(); };
    $("#semua").onclick = () => { per = ""; draw(); };
    $("#st").onchange = (e) => { st = e.target.value; draw(); };
    pasangHapus(draw);
    $$("[data-wa]").forEach((b) => (b.onclick = () => { const r = rows[+b.dataset.wa]; kirimWA("benefit", { ref_id: r.id, benefit: r.benefit.nama, pelanggan: r.akad.pelanggan.nama, nama_pic: r.akad.pelanggan.nama_pic, no_wa: r.akad.pelanggan.no_wa, nomor_akad: r.akad.nomor, tanggal: r.batas_waktu, cabang: cabangNama(r.cabang_id), sisa_hari: Math.round((new Date(r.batas_waktu) - new Date(today())) / 864e5) }); }));
    $$("[data-ok]").forEach((b) => (b.onclick = () => {
      const r = rows[+b.dataset.ok];
      modal("Benefit dipenuhi", `<p><b>${esc(r.benefit.nama)}</b> — ${esc(r.akad.pelanggan.nama)}</p><form class="form" id="f">
        <label>Tanggal<input type="date" name="tgl_dipenuhi" value="${today()}" required></label>
        <label>Biaya (Rp)<input type="number" name="biaya" min="0" step="1000" value="0"></label>
        <label class="full">Catatan<textarea name="catatan" rows="2"></textarea></label>
        <label class="full">Bukti (foto/PDF, opsional)<input type="file" name="bukti" accept="image/*,application/pdf"></label>
        <div class="form-actions"><button type="button" class="btn" onclick="tutupModal()">Batal</button><button class="btn primary">Simpan</button></div></form>`, (el) => {
        $("#f", el).onsubmit = async (e) => {
          e.preventDefault(); const f = e.target; const file = f.bukti.files[0];
          const upd = { status: "dipenuhi", tgl_dipenuhi: f.tgl_dipenuhi.value, biaya: +f.biaya.value || 0, catatan: f.catatan.value || null };
          if (file) upd.bukti_url = await upload(`${r.cabang_id}/benefit/${r.id}/${Date.now()}_${file.name}`, file, file.type);
          cek(await sb.from("kewajiban_benefit").update(upd).eq("id", r.id)); tutupModal(); toast("Benefit tercatat"); hitungPengingat(); draw();
        };
      });
    }));
  };
  await draw();
};

/* ---------- PENGATURAN (Super Admin) ---------- */
VIEWS.pengaturan = async () => {
  let tab = "paket";
  const draw = async () => {
    $("#view").innerHTML = `<div class="tabs">${[["paket", "Paket"], ["benefit", "Benefit wajib"], ["umum", "Umum & target"], ["akun", "Akun"], ["log", "Log aktivitas"], ["hapus", "Hapus data"]].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div><div id="tabBody"></div>`;
    $$(".tabs button").forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
    const body = $("#tabBody");
    if (tab === "paket") {
      const p = S.paket || { harga_bulanan: "", kunjungan_per_bulan: 1, durasi_min_bulan: 12, nama: "Paket Maintenance Standar" };
      body.innerHTML = `<div class="card"><h3>Paket standar</h3><form class="form" id="f">
        <label class="full">Nama paket<input name="nama" value="${esc(p.nama)}" required></label>
        <label>Harga per unit / bulan (Rp)<input type="number" name="harga_bulanan" value="${p.harga_bulanan}" min="0" step="1000" required></label>
        <label>Kunjungan per bulan<input type="number" name="kunjungan_per_bulan" value="${p.kunjungan_per_bulan}" min="1" max="8" required></label>
        <label>Durasi minimal kontrak (bulan)<input type="number" name="durasi_min_bulan" value="${p.durasi_min_bulan}" min="1" required></label>
        <div class="form-actions"><button class="btn primary">Simpan paket</button></div></form>
        <p class="muted">Harga di sini jadi harga default saat membuat akad baru. Harga di akad yang sudah berjalan tidak berubah.</p></div>`;
      $("#f").onsubmit = async (e) => {
        e.preventDefault(); const v = fd(e.target); ["harga_bulanan", "kunjungan_per_bulan", "durasi_min_bulan"].forEach((k) => (v[k] = +v[k]));
        cek(S.paket ? await sb.from("paket").update(v).eq("id", S.paket.id) : await sb.from("paket").insert(v));
        await muatMaster(); toast("Paket tersimpan"); draw();
      };
    }
    if (tab === "benefit") {
      const F = { bulanan: "Tiap bulan", triwulan: "Tiap 3 bulan", semester: "Tiap 6 bulan", tahunan: "Tiap tahun", sekali: "Sekali di awal" };
      body.innerHTML = `<div class="card"><div class="card-head"><h3>Benefit yang wajib dipenuhi</h3><button class="btn primary sm" id="baru">+ Benefit</button></div>
        <div class="tbl-wrap">${S.benefit.length ? `<table><thead><tr><th>Benefit</th><th>Frekuensi</th><th>Status</th><th></th></tr></thead><tbody>${S.benefit.map((b, i) => `<tr><td><b>${esc(b.nama)}</b><small>${esc(b.deskripsi || "")}</small></td><td>${F[b.frekuensi]}</td><td>${b.aktif ? stBadge("aktif") : stBadge("berakhir")}</td><td class="act"><button class="btn sm" data-i="${i}">Ubah</button></td></tr>`).join("")}</tbody></table>` : `<div class="empty">Belum ada benefit. Contoh: cek kelistrikan, ganti filter, unit pengganti saat servis, prioritas respon 24 jam.</div>`}</div></div>`;
      const form = (b = { aktif: true, frekuensi: "bulanan" }) => modal(b.id ? "Ubah benefit" : "Benefit baru", `<form class="form" id="fb">
        <label class="full">Nama benefit<input name="nama" value="${esc(b.nama)}" required></label>
        <label class="full">Deskripsi<textarea name="deskripsi" rows="2">${esc(b.deskripsi)}</textarea></label>
        <label>Frekuensi<select name="frekuensi">${Object.entries(F).map(([k, l]) => `<option value="${k}" ${k === b.frekuensi ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="chk"><input type="checkbox" name="aktif" ${b.aktif ? "checked" : ""}> Aktif</label>
        <div class="form-actions"><button type="button" class="btn" onclick="tutupModal()">Batal</button><button class="btn primary">Simpan</button></div></form>`, (el) => {
        $("#fb", el).onsubmit = async (e) => {
          e.preventDefault(); const v = fd(e.target); v.aktif = !!v.aktif;
          cek(b.id ? await sb.from("benefit").update(v).eq("id", b.id) : await sb.from("benefit").insert(v));
          tutupModal(); await muatMaster(); toast("Benefit tersimpan"); draw();
        };
      });
      $("#baru").onclick = () => form();
      $$("[data-i]").forEach((x) => (x.onclick = () => form(S.benefit[+x.dataset.i])));
    }
    if (tab === "umum") {
      const rows = cek(await sb.from("pengaturan").select("*").order("kunci"));
      body.innerHTML = `<div class="card"><h3>Pengaturan umum</h3><form class="form" id="f">${rows.map((r) => `<label class="full">${esc(r.ket || r.kunci)}<input name="${esc(r.kunci)}" value="${esc(r.nilai)}"></label>`).join("")}
        <div class="form-actions"><button class="btn primary">Simpan</button></div></form></div>`;
      $("#f").onsubmit = async (e) => {
        e.preventDefault(); const v = fd(e.target);
        cek(await sb.from("pengaturan").upsert(Object.entries(v).map(([kunci, nilai]) => ({ kunci, nilai, ket: rows.find((r) => r.kunci === kunci)?.ket }))));
        await muatMaster(); toast("Pengaturan tersimpan");
      };
    }
    if (tab === "akun") {
      const rows = cek(await sb.rpc("daftar_akun"));
      body.innerHTML = `<div class="card"><h3>Atur akun</h3><p class="muted" style="margin-top:-6px">Buat user dulu di Supabase → Authentication → Add user (email + password), lalu tetapkan perannya di sini.</p>
        <form class="form" id="f"><label>Email<input type="email" name="email" required></label><label>Nama tampilan<input name="nama" required></label>
        <label>Peran<select name="peran" id="peran"><option value="cabang">Admin cabang</option><option value="super_admin">Super Admin</option></select></label>
        <label id="cabWrap">Cabang<select name="cabang">${S.cabang.map((c) => `<option value="${c.id}">${esc(c.nama)}</option>`).join("")}</select></label>
        <div class="form-actions"><button class="btn primary">Simpan akun</button></div></form></div>
        <div class="tbl-wrap"><table><thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Cabang</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.nama)}</td><td>${esc(r.email)}</td><td>${r.peran === "super_admin" ? "Super Admin" : "Admin cabang"}</td><td>${esc(r.cabang || "-")}</td></tr>`).join("")}</tbody></table></div>`;
      $("#peran").onchange = (e) => $("#cabWrap").classList.toggle("hidden", e.target.value === "super_admin");
      $("#f").onsubmit = async (e) => {
        e.preventDefault(); const v = fd(e.target);
        cek(await sb.rpc("atur_akun", { p_email: v.email, p_nama: v.nama, p_peran: v.peran, p_cabang: v.peran === "cabang" ? +v.cabang : null }));
        toast("Akun tersimpan"); draw();
      };
    }
    if (tab === "hapus") {
      const L = {
        transaksi: ["Transaksi saja", "Tagihan, kunjungan, benefit, dan riwayat pengingat. Akad & pelanggan tetap ada — catatan: sistem akan otomatis membuat ulang tagihan & kunjungan bulan ini dan bulan depan untuk akad yang masih aktif."],
        akad: ["Transaksi + akad", "Semua di atas ditambah semua akad beserta unitnya. Pelanggan tetap ada. Nomor akad mulai lagi dari 0001 bila semua cabang dipilih."],
        semua: ["Semua data operasional", "Semua di atas ditambah semua pelanggan. Aplikasi kembali kosong seperti baru dipasang."],
      };
      body.innerHTML = `<div class="card" style="border-color:var(--bad)"><h3 style="color:var(--bad)">Hapus data</h3>
        <p class="muted" style="margin-top:-6px">Data yang dihapus <b>tidak bisa dikembalikan</b>. Bila perlu, ekspor dulu tabelnya ke CSV dari Supabase → Table Editor. Pengaturan paket, benefit, target, cabang, dan akun tidak ikut terhapus.</p>
        <form class="form" id="f">
          <div class="full" style="display:flex;flex-direction:column;gap:10px">${Object.entries(L).map(([k, [j, d]], i) => `<label class="chk" style="align-items:flex-start;border:1px solid var(--line);border-radius:8px;padding:10px 12px"><input type="radio" name="lingkup" value="${k}" ${i === 1 ? "checked" : ""} style="margin-top:3px"><span><b>${j}</b><br><span class="muted" style="font-weight:400">${d}</span></span></label>`).join("")}</div>
          <label>Cabang<select name="cabang"><option value="">Semua cabang</option>${S.cabang.map((c) => `<option value="${c.id}">${esc(c.nama)}</option>`).join("")}</select></label>
          <label><span>Ketik <b>HAPUS</b> untuk konfirmasi</span><input name="konfirmasi" autocomplete="off" placeholder="HAPUS"></label>
          <div class="form-actions"><button class="btn primary" style="background:var(--bad);border-color:var(--bad)" id="hapusBtn">Hapus data</button></div>
        </form><div id="hasil"></div></div>`;
      $("#f").onsubmit = async (e) => {
        e.preventDefault(); const v = fd(e.target);
        if (v.konfirmasi !== "HAPUS") return toast("Ketik HAPUS (huruf besar) untuk konfirmasi", true);
        const nmCab = v.cabang ? "cabang " + cabangNama(+v.cabang) : "SEMUA cabang";
        if (!confirm(`Yakin hapus "${L[v.lingkup][0]}" untuk ${nmCab}? Tindakan ini tidak bisa dibatalkan.`)) return;
        const btn = $("#hapusBtn"); btn.disabled = true; btn.textContent = "Menghapus…";
        const res = await sb.rpc("hapus_data", { p_lingkup: v.lingkup, p_cabang: v.cabang ? +v.cabang : null });
        btn.disabled = false; btn.textContent = "Hapus data";
        if (res.error) return toast(res.error.message, true);
        const h = res.data; e.target.konfirmasi.value = "";
        $("#hasil").innerHTML = `<p style="margin-top:12px"><span class="badge b-good">Berhasil</span> Terhapus: ${h.tagihan} tagihan, ${h.kunjungan} kunjungan, ${h.benefit} benefit, ${h.akad} akad, ${h.pelanggan} pelanggan (${esc(nmCab)}).</p>`;
        await hitungPengingat(); renderNav("pengaturan", S.jumlahPengingat);
      };
    }
    if (tab === "log") {
      const [rows, akun] = await Promise.all([sb.from("log_aktivitas").select("*").order("created_at", { ascending: false }).limit(200), sb.rpc("daftar_akun")]);
      const nm = Object.fromEntries((akun.data || []).map((a) => [a.user_id, a.nama]));
      const aksi = { insert: "menambah", update: "mengubah", delete: "menghapus" };
      body.innerHTML = `<div class="tbl-wrap">${(rows.data || []).length ? `<table><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aktivitas</th><th>Ringkasan</th></tr></thead><tbody>${rows.data.map((r) => {
        const d = r.detail?.sesudah || r.detail || {}; const b = r.detail?.sebelum;
        const ubah = r.aksi === "hapus massal" ? `${r.ref_id} — ` + Object.entries(r.detail || {}).map(([k, v]) => `${k} ${v}`).join(", ") : b ? Object.keys(d).filter((k) => JSON.stringify(d[k]) !== JSON.stringify(b[k]) && !/url|_at$/.test(k)).map((k) => `${k}: ${b[k] ?? "-"} → ${d[k] ?? "-"}`).join(", ") : d.nomor || d.nama || "";
        return `<tr><td>${new Date(r.created_at).toLocaleString("id-ID")}</td><td>${esc(nm[r.user_id] || "-")}</td><td>${aksi[r.aksi] || r.aksi} ${esc(r.tabel)}</td><td><small style="color:var(--ink-2)">${esc(String(ubah).slice(0, 200))}</small></td></tr>`; }).join("")}</tbody></table>` : `<div class="empty">Belum ada aktivitas.</div>`}</div>`;
    }
  };
  await draw();
};

boot();
