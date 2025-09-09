"use strict";

/* ================== KONFIG ================== */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzgod3bBBFmKBqlgyW_4oPUkCTUsaqznDV-JxPPNSac7BtTbOaMSZoBN-Y_WGaDeFj9sQ/exec"; // ganti dengan URL Web App GAS
const ONE_MB = 1024 * 1024;
const MAX_MB_EACH = 5;
const ALLOWED_TYPES = ["image/", "application/pdf"];

/* ================== UTIL ================== */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
const fmtIDR = (n) => {
  const v = (typeof n === "number" ? n : String(n).replace(/[^\d-]/g, "")) || 0;
  return "Rp " + Number(v).toLocaleString("id-ID");
};
const onlyNum = (s) => String(s || "").replace(/[^\d]/g, "");
const debounce = (fn, ms = 300) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
const pad = (n, len = 3) => String(n).padStart(len, "0");

/* ================== NAV / ROLE ================== */
const secHome   = $("#homeSec");
const secStep1  = $("#step1");
const secStep2  = $("#step2");
const secStep3  = $("#step3");
const secRekap  = $("#rekapSec");
const secAkun   = $("#akunSec");
const sections = {homeSec:secHome, step1:secStep1, step2:secStep2, step3:secStep3, rekapSec:secRekap, akunSec:secAkun};

function showSection(id){
  Object.values(sections).forEach(s => s.classList.add("hidden"));
  (sections[id]||secHome).classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}
$$(".top-tabs .tab-btn, .goBtn, .segmen-shortcuts .chip").forEach(btn=>{
  on(btn, "click", (e)=>{
    const go = btn.dataset.go;
    if (go) showSection(go);
    const seg = btn.dataset.seg;
    if (go==="rekapSec" && seg) { $("#rekapJenis").value = seg; }
  }, {passive:true});
});
on($("#gotoInput"), "click", ()=> showSection("step1"), {passive:true});

/* Simulasi-Role (front-end only; RBAC asli di backend) */
const roleName = $("#roleName");
const whoAmI = $("#whoAmI");
const btnSimulasiLogin = $("#btnSimulasiLogin");
const ROLES = {
  admin: {label:"Admin Keuangan & Proyek", email:"dq060412@gmail.com"},
  ops:   {label:"Input Operasional", email:"irpan100802@gmail.com"},
  mat:   {label:"Input Material", email:"alfauzi170701@gmail.com"},
  audit: {label:"Auditor", email:"dikiabdurahman222@gmail.com"}
};
let CURRENT_ROLE = "admin"; // default
function applyRole(){
  const r = ROLES[CURRENT_ROLE];
  roleName.textContent = r ? r.label : "—";
  whoAmI.innerHTML = `<div>Email: <b>${r.email}</b></div><div>Role: <b>${r.label}</b></div>`;
  // hide tombol input jika auditor
  const isAudit = CURRENT_ROLE === "audit";
  $("#gotoInput").style.display = isAudit ? "none" : "";
  $$("#step1 .btn.primary").forEach(b => b.disabled = isAudit);
}
on(btnSimulasiLogin, "click", ()=>{
  const keys = Object.keys(ROLES);
  const i = (keys.indexOf(CURRENT_ROLE)+1) % keys.length;
  CURRENT_ROLE = keys[i]; applyRole();
}, {passive:true});
applyRole();

/* ================== DASHBOARD ================== */
const btnRefresh = $("#btnRefresh");
const statBoxes = $("#statBoxes");
const qGlobal = $("#qGlobal");
const btnSearch = $("#btnSearch");
const chartCanvas = $("#chartFlow");
let chartFlow;

function paintStats(d){
  const map = [
    {label:"Saldo Hari Ini", val:d.todaySaldo||0},
    {label:"Tagihan Hari Ini", val:d.todayTagihan||0},
    {label:"Pengeluaran Hari Ini", val:d.todayOut||0},
    {label:"Total Utang Saat Ini", val:d.totalUtang||0},
    {label:"Total Tagihan Saat Ini", val:d.totalTagihan||0}
  ];
  statBoxes.innerHTML = map.map(x => (
    `<div class="stat"><div class="label">${x.label}</div><div class="val">${fmtIDR(x.val)}</div></div>`
  )).join("");
}
function makeChart(data){
  if (!window.Chart) return;
  if (chartFlow) chartFlow.destroy();
  chartFlow = new Chart(chartCanvas, {
    type:"line",
    data:{ labels:data.labels||[], datasets:[
      {label:"Pemasukan", data:data.in||[], tension:.25, borderWidth:2},
      {label:"Pengeluaran", data:data.out||[], tension:.25, borderWidth:2}
    ]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:true}}}
  });
}
async function loadDashboard(){
  try{
    const r = await fetch(`${SCRIPT_URL}?action=dashboard`, {method:"GET"});
    const d = await r.json();
    paintStats(d);
    makeChart(d.chart||{labels:[],in:[],out:[]});
    renderQuickTags(d.quickTags||[]);
    renderPrio(d.prioritas||[]);
  }catch(e){ console.error(e); }
}
function renderQuickTags(tags){
  const box = $("#quickTags");
  box.innerHTML = tags.map(t=>`<button class="chip" data-q="${t}">${t}</button>`).join("");
  $$("#quickTags .chip").forEach(ch => on(ch,"click",()=>{ qGlobal.value = ch.dataset.q; doSearch(); }, {passive:true}));
}
function renderPrio(items){
  const el = $("#prioList");
  if (!items.length){ el.innerHTML = `<div class="muted">Belum ada prioritas.</div>`; return; }
  el.innerHTML = items.map(it=>`<div>• ${it}</div>`).join("");
}
const doSearch = debounce(async ()=>{
  const q = qGlobal.value.trim();
  if (!q) return;
  try{
    const r = await fetch(`${SCRIPT_URL}?action=search&q=${encodeURIComponent(q)}`);
    const d = await r.json();
    // tampilkan minimal jumlah hasil
    alert(`Ditemukan ${d.total||0} transaksi terkait "${q}"`);
  }catch(e){ console.error(e); }
}, 350);
on(btnSearch, "click", doSearch);
on(qGlobal, "input", debounce(()=>{ /* live hint (opsional) */ }, 250));
on(btnRefresh, "click", loadDashboard, {passive:true});
on($("#applyRange"), "click", loadDashboard, {passive:true});
/* lazy inisiasi chart saat terlihat */
const io = new IntersectionObserver((entries)=>{
  entries.forEach(en=>{
    if(en.isIntersecting){ loadDashboard(); io.disconnect(); }
  });
}, {root:null, threshold:.2});
io.observe(chartCanvas);

/* ================== INPUT FLOW (Material-first) ================== */
// STEP1 → STEP2
const toStep2Btn = $("#toStep2");
on(toStep2Btn, "click", (e)=>{ e.preventDefault(); showSection("step2"); });

// elemen Step2
const penginputSel = $("#penginput");
const jenisSel = $("#jenis");
const kategoriSel = $("#kategoriAwal");
const tanggal = $("#tanggal");
const proyek = $("#proyek");
const noFaktur = $("#noFaktur");
const kreditor = $("#kreditor");
const kreditorLain = $("#kreditorLain");
const statusSel = $("#status");

const namaBarang = $("#namaBarang");
const hargaSatuan = $("#hargaSatuan");
const qty = $("#qty");
const addItem = $("#addItem");
const itemsWrap = $("#itemsWrap");
const grandTotal = $("#grandTotal");

let ITEMS = [];
function refreshItems(){
  itemsWrap.innerHTML = ITEMS.map((it, i)=>(
    `<div class="item">
      <div>${it.nama}</div>
      <div class="muted">${fmtIDR(it.harga)}</div>
      <div class="muted">x${it.qty}</div>
      <div><b>${fmtIDR(it.total)}</b></div>
      <button class="rm" data-i="${i}">×</button>
    </div>`
  )).join("");
  const sum = ITEMS.reduce((a,b)=> a + b.total, 0);
  grandTotal.textContent = fmtIDR(sum);
  $$(".rm", itemsWrap).forEach(btn => on(btn,"click",()=>{
    const i = Number(btn.dataset.i); ITEMS.splice(i,1); refreshItems();
  }));
}
function addCurrentItem(){
  const nm = (namaBarang.value||"").trim();
  const hs = Number(onlyNum(hargaSatuan.value)||0);
  const q  = Number(onlyNum(qty.value)||0);
  if (!nm) return alert("Isi nama barang.");
  if (!hs || !q) return alert("Harga/Qty belum lengkap.");
  ITEMS.push({nama:nm, harga:hs, qty:q, total:hs*q});
  namaBarang.value=""; hargaSatuan.value=""; qty.value="";
  refreshItems();
}
on(addItem, "click", (e)=>{ e.preventDefault(); addCurrentItem(); });

// kreditor lain
on(kreditor, "change", ()=>{
  if (kreditor.value==="_OTHER_"){ kreditorLain.classList.remove("hidden"); kreditorLain.focus(); }
  else { kreditorLain.classList.add("hidden"); kreditorLain.value = ""; }
}, {passive:true});

// auto No Faktur dari backend
async function loadNextFaktur(){
  try{
    noFaktur.value = "Menunggu…";
    const r = await fetch(`${SCRIPT_URL}?action=nextFaktur`);
    const d = await r.json();
    noFaktur.value = d.noFaktur || "INV-000001";
  }catch(e){ noFaktur.value = "INV-000001"; }
}
loadNextFaktur();

// NAV Step2/3
on($("#backTo1"), "click", (e)=>{ e.preventDefault(); showSection("step1"); }, {passive:true});
on($("#toStep3"), "click", (e)=>{
  e.preventDefault();
  if (!tanggal.value) return alert("Isi tanggal.");
  if (!proyek.value)  return alert("Pilih proyek.");
  if (!ITEMS.length)  return alert("Tambahkan minimal 1 item.");
  showSection("step3");
}, {passive:true});

/* ================== STEP3 (Upload & Preview) ================== */
const wrapBon = $("#wrapBon"), wrapSJ = $("#wrapSJ"), wrapUmum = $("#wrapBuktiUmum");
function filesOK(list, label){
  const files = [...(list||[])];
  for(const f of files){
    const okType = ALLOWED_TYPES.some(p => f.type.startsWith(p));
    const okSize = f.size <= MAX_MB_EACH * ONE_MB;
    if(!okType){ alert(`${label}: ${f.name} bertipe tidak didukung.`); return false; }
    if(!okSize){ alert(`${label}: ${f.name} > ${MAX_MB_EACH}MB.`); return false; }
  }
  return true;
}

const previewModal = $("#previewModal");
const pvStep1 = $("#pvStep1"), pvStep2 = $("#pvStep2");
const pvTab1 = $("#pvTab1"), pvTab2 = $("#pvTab2");
const pvBack = $("#pvBack"), pvNext = $("#pvNext");
function pvShow(n){
  const one = n===1;
  pvStep1.classList.toggle("show", one);
  pvStep2.classList.toggle("show", !one);
  pvTab1.classList.toggle("active", one);
  pvTab2.classList.toggle("active", !one);
  pvBack.classList.toggle("hidden", one);
  pvNext.classList.toggle("hidden", !one);
}
on(pvTab1,"click",()=>pvShow(1),{passive:true});
on(pvTab2,"click",()=>pvShow(2),{passive:true});
on(pvBack,"click",()=>pvShow(1),{passive:true});
on(pvNext,"click",()=>pvShow(2),{passive:true});

function openPreview(){
  // validasi file
  const isMatPeng = true; // flow kita material
  let ok = true;
  if (isMatPeng){
    ok = filesOK($("#buktiBon").files, "Bukti Bon") && filesOK($("#buktiSJ").files, "Bukti Surat Jalan");
  } else {
    ok = filesOK($("#buktiUmum").files, "Bukti Transaksi");
  }
  if (!ok) return;

  // ringkasan
  const kreditorFinal = (kreditor.value==="_OTHER_") ? (kreditorLain.value||"").trim() : kreditor.value;
  $("#pv-penginput").textContent = penginputSel.value;
  $("#pv-jenis").textContent     = "Pengeluaran";
  $("#pv-kategori").textContent  = "Material";
  $("#pv-tanggal").textContent   = tanggal.value || "-";
  $("#pv-proyek").textContent    = proyek.value || "-";
  $("#pv-kreditor").textContent  = kreditorFinal || "-";
  $("#pv-status").textContent    = statusSel.value;

  const lines = ITEMS.map(it => `• ${it.nama} — ${fmtIDR(it.harga)} × ${it.qty} = ${fmtIDR(it.total)}`).join("\n");
  $("#pv-mat-value").textContent = `Faktur: ${noFaktur.value}\n${lines}`;
  $("#pv-nominal").textContent   = grandTotal.textContent;

  // thumbs
  const thumbs = $("#pv-thumbs"); thumbs.innerHTML = "";
  const files = [...($("#buktiBon").files||[]), ...($("#buktiSJ").files||[]), ...($("#buktiUmum").files||[])].slice(0,8);
  if (!files.length){ $("#pv-bukti-kosong").classList.remove("hidden"); }
  else {
    $("#pv-bukti-kosong").classList.add("hidden");
    files.forEach(f=>{
      const div = document.createElement("div"); div.className = "thumb";
      if ((f.type||"").startsWith("image/")){
        const img = document.createElement("img");
        const url = URL.createObjectURL(f);
        img.onload = ()=> URL.revokeObjectURL(url);
        img.src = url; div.appendChild(img);
      } else { div.textContent = "PDF"; }
      thumbs.appendChild(div);
    });
  }

  pvShow(1);
  previewModal.classList.add("show");
}
on($("#openPreview"), "click", (e)=>{ e.preventDefault(); openPreview(); });

on($("#cancel-btn"), "click", ()=> previewModal.classList.remove("show"));

/* ================== SEND ================== */
const loadingPop = $("#loadingPop");
const resultPop  = $("#resultPop");
const resultIcon = $("#resultIcon");
const resultTitle= $("#resultTitle");
const resultMsg  = $("#resultMsg");
const btnKeluar  = $("#btnKeluar");
const btnInputKembali = $("#btnInputKembali");
const resultActions = $("#resultActions");
const resultClose = $("#resultClose");

function showLoading(b=true){ loadingPop.classList.toggle("show", b); }
function showResult(type, title, msg, {onlyDismiss=false}={}){
  if(type==="success"){
    resultIcon.innerHTML = '<div class="chip" style="background:#22c55e;color:#fff;padding:10px 14px;border-radius:999px;font-weight:700">OK</div>';
    resultActions.style.display = "";
    resultClose.classList.add("hidden");
  }else{
    resultIcon.innerHTML = '<div class="chip" style="background:#ef4444;color:#fff;padding:10px 14px;border-radius:999px;font-weight:700">ERR</div>';
    resultActions.style.display = "none";
    resultClose.classList.remove("hidden");
    on(resultClose,"click",()=> resultPop.classList.remove("show"), {once:true});
  }
  resultTitle.textContent = title || "Selesai";
  resultMsg.textContent   = msg || "";
  btnKeluar.onclick = ()=> window.history.length ? history.back() : location.replace("about:blank");
  btnInputKembali.style.display = type==="success" && !onlyDismiss ? "" : "none";
  resultPop.classList.add("show");
}

async function sendData(){
  previewModal.classList.remove("show");

  const kreditorFinal = (kreditor.value==="_OTHER_") ? (kreditorLain.value||"").trim() : kreditor.value;
  const payload = {
    action:"submit",
    penginput: penginputSel.value,
    jenis: "Pengeluaran",
    kategori: "Material",
    tanggal: tanggal.value,
    proyek: proyek.value,
    kreditor: kreditorFinal,
    status: statusSel.value,
    noFaktur: noFaktur.value,
    items: ITEMS,
    total: ITEMS.reduce((a,b)=>a+b.total,0),
    buktiInvoice:[], buktiSuratJalan:[], buktiLain:[],
    deferredFiles:[]
  };

  function pushFiles(list, arr){
    [...(list||[])].forEach(f=>{
      if (f.size > ONE_MB){
        payload.deferredFiles.push({name:f.name, type:f.type, size:f.size, bucket:"general"});
      }else{
        const fr = new FileReader();
        const p = new Promise(res=>{
          fr.onloadend = ()=>{
            const base64 = String(fr.result||"").split(",")[1]||"";
            arr.push({name:f.name, type:f.type, base64}); res();
          };
        });
        fr.readAsDataURL(f);
        readers.push(p);
      }
    });
  }
  const readers = [];
  pushFiles($("#buktiBon").files, payload.buktiInvoice);
  pushFiles($("#buktiSJ").files,  payload.buktiSuratJalan);
  pushFiles($("#buktiUmum").files, payload.buktiLain);

  try{
    showLoading(true);
    await Promise.all(readers);
    const ctl = new AbortController(); const to = setTimeout(()=>ctl.abort(), 25000);
    const r = await fetch(SCRIPT_URL, {
      method:"POST",
      headers:{ "Content-Type":"text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
      signal: ctl.signal
    }).finally(()=>clearTimeout(to));
    const d = await r.json();
    showLoading(false);
    if (d.status==="ok"){
      showResult("success","Selesai","Data anda telah terinput.");
      // reset ringan
      ITEMS = []; refreshItems();
      $("#buktiBon").value = ""; $("#buktiSJ").value=""; $("#buktiUmum").value="";
      namaBarang.value=""; hargaSatuan.value=""; qty.value="";
      loadNextFaktur();
      showSection("step1");
    }else{
      showResult("error","Gagal", d.error||"Gagal menyimpan.");
    }
  }catch(err){
    showLoading(false);
    const msg = err.name==="AbortError" ? "Koneksi lambat. Coba lagi (maks 25 dtk)." :
      (String(err).includes("Failed to fetch") ? "Gagal terhubung ke server." : err.message);
    showResult("error","Terjadi Kesalahan", msg);
    console.error(err);
  }
}
on($("#confirm-btn"), "click", sendData);

/* ================== PICKER (nice-select) ================== */
const pickerPop = $("#pickerPop");
const pickerTitle = $("#pickerTitle");
const pickerList  = $("#pickerList");
on($("#pickerCancel"), "click", ()=> pickerPop.classList.remove("show"), {passive:true});

function openPicker(selectEl, btn){
  pickerTitle.textContent = btn.parentElement.querySelector("label")?.textContent || "Pilih Opsi";
  pickerList.innerHTML = "";
  [...selectEl.options].forEach((opt, idx)=>{
    const div = document.createElement("div");
    div.className = "opt" + (opt.selected ? " sel":"");
    div.textContent = opt.text;
    if (!opt.disabled){
      on(div, "click", ()=>{
        selectEl.selectedIndex = idx;
        btn.textContent = opt.text;
        selectEl.dispatchEvent(new Event("change",{bubbles:true}));
        pickerPop.classList.remove("show");
      }, {once:true});
    }
    pickerList.appendChild(div);
  });
  pickerPop.classList.add("show");
}
function initNice(){
  $$("select[data-nice]").forEach((sel)=>{
    if (sel.dataset.enhanced) return; sel.dataset.enhanced = "1";
    sel.classList.add("native-hidden");
    const wrap = document.createElement("div"); wrap.className = "nice-wrap"; sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel);
    const btn = document.createElement("button"); btn.type="button"; btn.className="input"; btn.style.textAlign="left";
    btn.textContent = sel.options[sel.selectedIndex]?.text || "";
    wrap.appendChild(btn);
    const open = (e)=>{ e.preventDefault(); openPicker(sel, btn); };
    on(btn, "click", open);
    on(btn, "touchstart", open, {passive:false});
  });
}
document.addEventListener("DOMContentLoaded", initNice);

