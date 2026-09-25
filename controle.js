// ---------- controle geral: o que já foi feito (placa x cavalete), salvo na planilha do Google ----------
const SHEET_URL = ""; // URL do App da Web do Apps Script (termina em /exec)
const CACHE_KEY = "village-plaquinhas-cache-v2";
const FILA_KEY = "village-plaquinhas-fila-v2";
const LEGADO_KEY = "village-plaquinhas-feitos-v1";
const TIPOS = { placa: "Placa", cavalete: "Cavalete" };

let linhasReg = [];   // [{data, chave, nome, tipo, qtd}] — espelho da planilha
let reg = {};         // agregado por chave

function chaveItem(nome) {
  return nome.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
function lsGet(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.error(e); } }

function agregar() {
  reg = {};
  [...linhasReg, ...lsGet(FILA_KEY, []).flatMap(p => p.acao === "registrar" ? p.itens : [])].forEach(l => {
    if (!TIPOS[l.tipo]) return;
    const r = reg[l.chave] || (reg[l.chave] = { nome: l.nome });
    const dia = String(l.data).slice(0, 10);
    const t = r[l.tipo] || (r[l.tipo] = { qtd: 0, primeira: dia, ultima: dia });
    t.qtd += l.qtd;
    if (dia < t.primeira) t.primeira = dia;
    if (dia > t.ultima) t.ultima = dia;
  });
  lsGet(FILA_KEY, []).filter(p => p.acao === "apagar").forEach(p => delete reg[p.chave]);
}
function lerRegistro() { return reg; }

function setConexao(txt, erro) {
  const el = $("ctrl-conexao");
  el.textContent = txt;
  el.className = "contagem" + (erro ? " err" : "");
}

async function post(payload) {
  const r = await fetch(SHEET_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.erro || "falha na planilha");
}

async function enviarFila() {
  if (!SHEET_URL) return;
  const fila = lsGet(FILA_KEY, []);
  while (fila.length) {
    await post(fila[0]);
    fila.shift();
    lsSet(FILA_KEY, fila);
  }
}

let sincronizando = null, deNovo = false;
function carregar() {
  if (sincronizando) { deNovo = true; return sincronizando; }
  sincronizando = sincronizar().finally(() => {
    sincronizando = null;
    if (deNovo) { deNovo = false; carregar(); }
  });
  return sincronizando;
}

async function sincronizar() {
  linhasReg = lsGet(CACHE_KEY, []);
  agregar(); renderControle();
  if (!SHEET_URL) { setConexao("⚠ Planilha não configurada — registro só neste navegador.", true); return; }
  setConexao("Sincronizando com a planilha…");
  try {
    await enviarFila();
    const r = await fetch(SHEET_URL);
    const j = await r.json();
    if (!j.ok) throw new Error(j.erro);
    linhasReg = j.linhas;
    lsSet(CACHE_KEY, linhasReg);
    agregar(); renderControle();
    if (grupos.length) render();
    setConexao(`✓ Registro geral sincronizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (e) {
    console.error(e);
    const pend = lsGet(FILA_KEY, []).length;
    setConexao(`⚠ Sem conexão com a planilha (${e.message}).${pend ? ` ${pend} envio(s) aguardando — tenta de novo sozinho.` : ""}`, true);
  }
}

async function enfileirar(payload) {
  const fila = lsGet(FILA_KEY, []);
  fila.push(payload);
  lsSet(FILA_KEY, fila);
  agregar(); renderControle();
  if (grupos.length) render();
  await carregar();
}

function registrarFeitos(itens, tipo) {
  const data = new Date().toISOString();
  const cont = {};
  itens.forEach(nome => {
    const k = chaveItem(nome);
    (cont[k] || (cont[k] = { data, chave: k, nome: nome.toUpperCase(), tipo, qtd: 0 })).qtd += 1;
  });
  enfileirar({ acao: "registrar", itens: Object.values(cont) });
}

function fmtData(iso) { return iso ? iso.slice(0, 10).split("-").reverse().join("/") : ""; }
function badgesFeito(nome) {
  const r = reg[chaveItem(nome)];
  if (!r) return `<span class="badge novo">nunca feito</span>`;
  return Object.keys(TIPOS).filter(t => r[t]).map(t =>
    `<span class="badge ${t}" title="última: ${fmtData(r[t].ultima)}">${TIPOS[t]} ✓</span>`).join("");
}

function renderControle() {
  const busca = chaveItem($("ctrl-busca").value || "");
  const filtro = $("ctrl-filtro").value;
  const passa = r => filtro === "todos" ||
    (filtro === "so-placa" && r.placa && !r.cavalete) ||
    (filtro === "so-cavalete" && r.cavalete && !r.placa) ||
    (filtro === "ambos" && r.placa && r.cavalete);
  const linhas = Object.entries(reg)
    .filter(([k, r]) => (!busca || k.includes(busca)) && passa(r))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const cel = t => t ? `<span class="ok">✓</span> ${t.qtd}× · ${fmtData(t.ultima)}` : `<span class="nao">—</span>`;
  $("ctrl-tabela").innerHTML = linhas.length ? `
    <table><thead><tr><th>Item</th><th>Placa</th><th>Cavalete</th><th></th></tr></thead><tbody>
    ${linhas.map(([k, r]) => `<tr><td>${escapeHtml(r.nome)}</td><td>${cel(r.placa)}</td><td>${cel(r.cavalete)}</td>
      <td><button class="del" data-k="${escapeHtml(k)}" title="apagar do controle">✕</button></td></tr>`).join("")}
    </tbody></table>`
    : `<p class="hint">${busca ? "Não encontrado — esse item nunca foi gerado." : "Nada registrado ainda. Cada PDF gerado entra aqui automaticamente."}</p>`;
  const todos = Object.values(reg);
  $("ctrl-resumo").textContent = `${todos.length} itens · ${todos.filter(r => r.placa).length} com placa · ${todos.filter(r => r.cavalete).length} com cavalete`;
  $("ctrl-tabela").querySelectorAll(".del").forEach(b => b.addEventListener("click", () => {
    if (!confirm(`Apagar "${reg[b.dataset.k].nome}" do registro geral? Some pra todo mundo.`)) return;
    enfileirar({ acao: "apagar", chave: b.dataset.k });
  }));
}

function baixar(nomeArq, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nomeArq;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

$("ctrl-busca").addEventListener("input", renderControle);
$("ctrl-filtro").addEventListener("change", renderControle);
$("ctrl-atualizar").addEventListener("click", carregar);
$("ctrl-csv").addEventListener("click", () => {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Item", "Placa", "Placa qtd", "Placa última", "Cavalete", "Cavalete qtd", "Cavalete última"]];
  Object.values(reg).sort((a, b) => a.nome.localeCompare(b.nome)).forEach(r => rows.push([
    r.nome, r.placa ? "sim" : "não", r.placa?.qtd, fmtData(r.placa?.ultima),
    r.cavalete ? "sim" : "não", r.cavalete?.qtd, fmtData(r.cavalete?.ultima)]));
  baixar(`controle-placas-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + rows.map(r => r.map(q).join(";")).join("\r\n"), "text/csv");
});

// registro antigo (só do navegador) sobe uma vez para a planilha
const legado = lsGet(LEGADO_KEY, null);
if (legado && SHEET_URL) {
  const itens = [];
  for (const [k, r] of Object.entries(legado))
    for (const t of Object.keys(TIPOS))
      if (r[t]) itens.push({ data: r[t].ultima, chave: k, nome: r.nome, tipo: t, qtd: r[t].qtd });
  if (itens.length) { const f = lsGet(FILA_KEY, []); f.push({ acao: "registrar", itens }); lsSet(FILA_KEY, f); }
  localStorage.removeItem(LEGADO_KEY);
}

carregar();
setInterval(carregar, 5 * 60 * 1000);
