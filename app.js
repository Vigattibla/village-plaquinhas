// Village Plaquinhas — parser heurístico + gerador de PDF (client-side, sem backend)

// ---------- geometria da plaquinha (espelha gerar.py do pipeline original) ----------
const CARD_W = 1150, CARD_H = 813;
const SIZE_MAX = 112;
const MAX_W = 960;
const LEADING = 1.05;
const CAP_RATIO = 0.70;
const DESC = 0.16;
const GANHO_MIN = 1.05;
const TOPO_LIVRE = 40;
const BASE_LIVRE = 660;
const CENTER_Y = (TOPO_LIVRE + BASE_LIVRE) / 2; // 350
const COLOR = [39 / 255, 50 / 255, 80 / 255];

const PAGE_W = 595.22, PAGE_H = 842;
const COLS_X = [16.56, 302.28];
const ROWS_Y = [16.44, 221.16, 425.94, 630.66];
const CELL_W = 276.0, CELL_H = 195.06;
const SCALE = CELL_W / CARD_W;

// ---------- geometria do cavalete (espelha gerar_cavalete.py) ----------
const CAV_CARD_W = 275.14, CAV_CARD_H = 206.35;
const CAV_FOLD_Y = CAV_CARD_H / 2;
const CAV_SIZE_MAX = 64.0;
const CAV_LEADING = 1.05;
const CAV_CAP_RATIO = 0.70;
const CAV_DESC = 0.16;
const CAV_GANHO_MIN = 1.05;

const CAV_MARGIN_IN = 8.0;
const CAV_TOPO_LIVRE = CAV_CARD_H * (170.0 / 852.0);
const CAV_BASE_LIVRE = CAV_CARD_H * (690.0 / 852.0);

const CAV_ZONE_BOT_Y0 = CAV_FOLD_Y + CAV_MARGIN_IN;
const CAV_ZONE_BOT_Y1 = CAV_BASE_LIVRE - CAV_MARGIN_IN;
const CAV_ZONE_BOT_CY = (CAV_ZONE_BOT_Y0 + CAV_ZONE_BOT_Y1) / 2;
const CAV_ZONE_BOT_H = CAV_ZONE_BOT_Y1 - CAV_ZONE_BOT_Y0;

const CAV_ZONE_TOP_Y0 = CAV_TOPO_LIVRE + CAV_MARGIN_IN;
const CAV_ZONE_TOP_Y1 = CAV_FOLD_Y - CAV_MARGIN_IN;
const CAV_ZONE_TOP_CY = (CAV_ZONE_TOP_Y0 + CAV_ZONE_TOP_Y1) / 2;
const CAV_ZONE_TOP_H = CAV_ZONE_TOP_Y1 - CAV_ZONE_TOP_Y0;

const CAV_ZONE_W = CAV_CARD_W - 2 * 25.0;
const CAV_ZONE_CX = CAV_CARD_W / 2;
const CAV_COLOR = [39 / 255, 50 / 255, 80 / 255];

// grade A4: 6 cavaletes por folha (2 col x 3 lin)
const CAV_PAGE_W = 595.276, CAV_PAGE_H = 841.89;
const CAV_GAP_X = 15.0, CAV_GAP_Y = 15.0;
const CAV_SIDE = (CAV_PAGE_W - (2 * CAV_CARD_W + CAV_GAP_X)) / 2;
const CAV_TOPBOT = (CAV_PAGE_H - (3 * CAV_CARD_H + 2 * CAV_GAP_Y)) / 2;
const CAV_COLS_X = [CAV_SIDE, CAV_SIDE + CAV_CARD_W + CAV_GAP_X];
const CAV_ROWS_Y = [CAV_TOPBOT, CAV_TOPBOT + CAV_CARD_H + CAV_GAP_Y, CAV_TOPBOT + 2 * (CAV_CARD_H + CAV_GAP_Y)];

// ---------- parser heurístico ----------
function parseText(text) {
  const numWords = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, "três": 3, quatro: 4, cinco: 5, seis: 6 };
  let globalMult = 1;
  const kept = []; // {name, qty, explicit}

  for (let raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;

    // linha de chat do WhatsApp: "[15:43, 14/09/2026] Fulano: resto da mensagem"
    const wa = line.match(/^\[\d{1,2}:\d{2}[^\]]*\]\s*[^:]{0,40}:\s*(.*)$/);
    if (wa) {
      line = wa[1].trim();
      if (!line) continue;
    }

    // bullets e numeração
    line = line.replace(/^[-*••▪●○]\s*/, "").replace(/^\d+[.)]\s+/, "");
    if (!line) continue;

    // instrução de multiplicador em qualquer ponto da linha: "2 de cada", "duas de cada", "3x tudo"
    const m = line.match(/\b(\d+|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis)\s*(x\b|vezes\b|de cada\b)/i);
    if (m) {
      const raw2 = m[1].toLowerCase();
      const n = /^\d+$/.test(raw2) ? parseInt(raw2, 10) : (numWords[raw2] || 1);
      if (n > globalMult) globalMult = n;
      if (line.split(/\s+/).length <= 7) continue; // linha é só a instrução
    }

    // saudação solta
    if (/^(oi+|ol[áa]|bom dia|boa tarde|boa noite|e a[ií]|fala|opa|beleza)\b/i.test(line)) continue;

    // frase dirigida a alguém (pedido), não é prato
    const soaRequest = /(preciso|voc[eê]\s+consegue|pfv\b|por favor|manda\s+(esse|essa|isso)|faz\s+(esse|essa|isso)|pode\s+(fazer|criar|gerar|montar)|obrigad[oa]|desde\s+j[aá])/i.test(line);
    if (soaRequest && line.split(/\s+/).length <= 14) continue;

    // prefixo de quantidade por item: "2x Nome" / "2 Nome"
    let qty = 1, explicit = false;
    const qm = line.match(/^(\d{1,2})\s*[xX]?\s+(.+)$/);
    if (qm) {
      qty = parseInt(qm[1], 10);
      line = qm[2].trim();
      explicit = true;
    }
    if (!line) continue;
    kept.push({ name: line, qty, explicit });
  }

  // aplica multiplicador global a quem não teve quantidade própria, e mescla duplicados (case-insensitive)
  const order = [];
  const byKey = new Map();
  for (const it of kept) {
    const finalQty = it.explicit ? it.qty : globalMult;
    const key = it.name.toLowerCase();
    if (byKey.has(key)) {
      byKey.get(key).qty = Math.max(byKey.get(key).qty, finalQty);
    } else {
      const entry = { name: it.name, qty: finalQty };
      byKey.set(key, entry);
      order.push(entry);
    }
  }
  return order;
}

// ---------- UI: estado e renderização ----------
let grupos = []; // [{name, qty}]

const $ = (id) => document.getElementById(id);

function render() {
  const cont = $("itens");
  cont.innerHTML = "";
  grupos.forEach((g, i) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input type="text" value="${escapeHtml(g.name)}" data-i="${i}" class="nome">
      ${badgesFeito(g.name)}
      <input type="number" min="0" max="50" value="${g.qty}" data-i="${i}" class="qty">
      <button class="del" data-i="${i}" title="remover">✕</button>`;
    cont.appendChild(row);
  });

  cont.querySelectorAll(".nome").forEach(el => el.addEventListener("input", e => {
    grupos[+e.target.dataset.i].name = e.target.value;
    renderPreview();
  }));
  cont.querySelectorAll(".qty").forEach(el => el.addEventListener("input", e => {
    grupos[+e.target.dataset.i].qty = Math.max(0, parseInt(e.target.value, 10) || 0);
    renderContagem();
    renderPreview();
  }));
  cont.querySelectorAll(".del").forEach(el => el.addEventListener("click", e => {
    grupos.splice(+e.target.dataset.i, 1);
    render(); renderContagem(); renderPreview();
  }));

  $("lista").style.display = grupos.length || true ? "block" : "none";
  renderContagem();
  renderPreview();
}

function renderContagem() {
  const total = grupos.reduce((s, g) => s + g.qty, 0);
  const folhas = Math.ceil(total / 8) || 0;
  $("contagem").textContent = `${grupos.length} itens únicos · ${total} plaquinhas · ${folhas} folha(s) A4`;
}

function renderPreview() {
  const grid = $("preview-grid");
  grid.innerHTML = "";
  grupos.forEach(g => {
    for (let i = 0; i < g.qty; i++) {
      const div = document.createElement("div");
      div.className = "mini-card";
      div.style.backgroundImage = "url('assets/base_plaquinha.png')";
      div.innerHTML = `<span>${escapeHtml(g.name.toUpperCase())}</span>`;
      grid.appendChild(div);
    }
  });
  renderPreviewCavalete();
}

function renderPreviewCavalete() {
  const grid = $("preview-grid-cavalete");
  grid.innerHTML = "";
  grupos.forEach(g => {
    for (let i = 0; i < g.qty; i++) {
      const div = document.createElement("div");
      div.className = "mini-card-cavalete";
      div.style.backgroundImage = "url('assets/base_cavalete.png')";
      const t = escapeHtml(g.name.toUpperCase());
      div.innerHTML = `<span class="cav-top">${t}</span><span class="cav-bot">${t}</span>`;
      grid.appendChild(div);
    }
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- eventos ----------
$("btn-interpretar").addEventListener("click", () => {
  const texto = $("texto").value;
  grupos = parseText(texto);
  const status = $("status");
  if (!grupos.length) {
    status.textContent = "Nenhum item reconhecido — adicione manualmente abaixo.";
    status.className = "err";
  } else {
    status.textContent = `${grupos.length} itens interpretados. Confira antes de gerar.`;
    status.className = "ok";
  }
  render();
});

$("btn-add").addEventListener("click", () => {
  const inp = $("novo-item");
  const nome = inp.value.trim();
  if (!nome) return;
  grupos.push({ name: nome, qty: 1 });
  inp.value = "";
  render();
});
$("novo-item").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-add").click(); });

$("btn-gerar").addEventListener("click", gerarPdf);
$("btn-gerar-cavalete").addEventListener("click", gerarCavaletesPdf);

// ---------- geração do PDF ----------
async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${url}`);
  return await res.arrayBuffer();
}

function widthAt(font, text, size) {
  return font.widthOfTextAtSize(text, size);
}

function wrap(font, words, n) {
  if (n === 1) return [words.join(" ")];
  if (words.length < n) return null;
  let best = null, bestScore = Infinity;
  const cutCombos = combinations(range(1, words.length), n - 1);
  for (const cuts of cutCombos) {
    const idx = [0, ...cuts, words.length];
    const lines = [];
    for (let i = 0; i < n; i++) lines.push(words.slice(idx[i], idx[i + 1]).join(" "));
    const score = Math.max(...lines.map(l => widthAt(font, l, SIZE_MAX)));
    if (score < bestScore) { bestScore = score; best = lines; }
  }
  return best;
}

function range(a, b) { const r = []; for (let i = a; i < b; i++) r.push(i); return r; }
function combinations(arr, k) {
  const res = [];
  const combo = [];
  function rec(start) {
    if (combo.length === k) { res.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      rec(i + 1);
      combo.pop();
    }
  }
  rec(0);
  return res;
}

function layout(font, text) {
  const words = text.split(/\s+/).filter(Boolean);
  const opcoes = [];
  for (const n of [1, 2, 3]) {
    const lines = wrap(font, words, n);
    if (!lines) continue;
    const w = Math.max(...lines.map(l => widthAt(font, l, SIZE_MAX)));
    const sz = w <= MAX_W ? SIZE_MAX : (SIZE_MAX * MAX_W / w);
    opcoes.push([lines, sz]);
  }
  let melhor = opcoes[0];
  for (const opt of opcoes.slice(1)) if (opt[1] > melhor[1] * GANHO_MIN) melhor = opt;
  return melhor;
}

function drawCard(page, font, bgImg, ox, oy, text) {
  page.drawImage(bgImg, { x: ox, y: PAGE_H - oy - CELL_H, width: CELL_W, height: CELL_H });
  const [lines, sz] = layout(font, text.toUpperCase());
  const pitch = sz * LEADING;
  const cap = sz * CAP_RATIO;
  const total = cap + pitch * (lines.length - 1);
  let top = CENTER_Y - total / 2;
  const fundo = top + total + sz * DESC;
  if (fundo > BASE_LIVRE) top -= (fundo - BASE_LIVRE);
  top = Math.max(top, TOPO_LIVRE);

  const { rgb } = PDFLib;
  lines.forEach((line, i) => {
    const by = top + cap + pitch * i;
    const bx = (CARD_W - widthAt(font, line, sz)) / 2;
    const pdfX = ox + bx * SCALE;
    const pdfY = PAGE_H - (oy + by * SCALE);
    page.drawText(line, { x: pdfX, y: pdfY, size: sz * SCALE, font, color: rgb(...COLOR) });
  });
}

// ---------- geração do PDF de cavaletes (dobra ao meio, texto invertido em cima) ----------
function cavWrap(font, words, n) {
  if (n === 1) return [words.join(" ")];
  if (words.length < n) return null;
  let best = null, bestScore = Infinity;
  const cutCombos = combinations(range(1, words.length), n - 1);
  for (const cuts of cutCombos) {
    const idx = [0, ...cuts, words.length];
    const lines = [];
    for (let i = 0; i < n; i++) lines.push(words.slice(idx[i], idx[i + 1]).join(" "));
    const score = Math.max(...lines.map(l => widthAt(font, l, CAV_SIZE_MAX)));
    if (score < bestScore) { bestScore = score; best = lines; }
  }
  return best;
}

function cavLayout(font, text, zoneW, zoneH) {
  const words = text.split(/\s+/).filter(Boolean);
  const opcoes = [];
  for (const n of [1, 2, 3]) {
    const lines = cavWrap(font, words, n);
    if (!lines) continue;
    const w = Math.max(...lines.map(l => widthAt(font, l, CAV_SIZE_MAX)));
    let sz = w <= zoneW ? CAV_SIZE_MAX : (CAV_SIZE_MAX * zoneW / w);
    const pitch = sz * CAV_LEADING;
    const cap = sz * CAV_CAP_RATIO;
    const total = cap + pitch * (lines.length - 1) + sz * CAV_DESC;
    if (total > zoneH) sz *= zoneH / total;
    opcoes.push([lines, sz]);
  }
  let melhor = opcoes[0];
  for (const opt of opcoes.slice(1)) if (opt[1] > melhor[1] * CAV_GANHO_MIN) melhor = opt;
  return melhor;
}

// zona invertida: mesma disposição centrada da zona normal, girada 180° em torno
// do centro da própria zona — equivalente ao morph(fixed_point, Matrix(180)) do PyMuPDF.
function cavDrawTextZone(page, font, ox, oy, cy, zoneH, text, rotate180) {
  const [lines, sz] = cavLayout(font, text, CAV_ZONE_W, zoneH);
  const pitch = sz * CAV_LEADING;
  const cap = sz * CAV_CAP_RATIO;
  const total = cap + pitch * (lines.length - 1);
  const top = cy - total / 2;
  const { rgb, degrees } = PDFLib;
  lines.forEach((line, i) => {
    const by = top + cap + pitch * i;
    const bx = CAV_ZONE_CX - widthAt(font, line, sz) / 2;
    const px = rotate180 ? ox + (2 * CAV_ZONE_CX - bx) : ox + bx;
    const yTopDown = rotate180 ? oy + (2 * cy - by) : oy + by;
    const py = CAV_PAGE_H - yTopDown;
    page.drawText(line, { x: px, y: py, size: sz, font, color: rgb(...CAV_COLOR), rotate: degrees(rotate180 ? 180 : 0) });
  });
}

function cavDrawCard(page, font, bgImg, ox, oy, text) {
  page.drawImage(bgImg, { x: ox, y: CAV_PAGE_H - oy - CAV_CARD_H, width: CAV_CARD_W, height: CAV_CARD_H });
  const texto = text.toUpperCase();
  cavDrawTextZone(page, font, ox, oy, CAV_ZONE_BOT_CY, CAV_ZONE_BOT_H, texto, false);
  cavDrawTextZone(page, font, ox, oy, CAV_ZONE_TOP_CY, CAV_ZONE_TOP_H, texto, true);
}

async function gerarCavaletesPdf() {
  const statusEl = $("status-gerar");
  const btn = $("btn-gerar-cavalete");
  const itens = [];
  grupos.forEach(g => { for (let i = 0; i < g.qty; i++) if (g.name.trim()) itens.push(g.name.trim()); });

  if (!itens.length) { statusEl.textContent = "Nada pra gerar."; return; }

  btn.disabled = true;
  statusEl.textContent = "Gerando PDF de cavaletes...";
  try {
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const [fontBytes, pngBytes] = await Promise.all([
      fetchBytes("assets/montserrat-700.ttf"),
      fetchBytes("assets/base_cavalete.png"),
    ]);
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });
    const bgImg = await pdfDoc.embedPng(pngBytes);

    let page = null;
    itens.forEach((nome, n) => {
      const slot = n % 6;
      if (slot === 0) page = pdfDoc.addPage([CAV_PAGE_W, CAV_PAGE_H]);
      cavDrawCard(page, font, bgImg, CAV_COLS_X[slot % 2], CAV_ROWS_Y[Math.floor(slot / 2)], nome);
    });

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cavaletes-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    registrarFeitos(itens, "cavalete");
    statusEl.textContent = `Pronto: ${itens.length} cavaletes, ${Math.ceil(itens.length / 6)} folha(s).`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Erro ao gerar PDF: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function gerarPdf() {
  const statusEl = $("status-gerar");
  const btn = $("btn-gerar");
  const itens = [];
  grupos.forEach(g => { for (let i = 0; i < g.qty; i++) if (g.name.trim()) itens.push(g.name.trim()); });

  if (!itens.length) { statusEl.textContent = "Nada pra gerar."; return; }

  btn.disabled = true;
  statusEl.textContent = "Gerando PDF...";
  try {
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const [fontBytes, pngBytes] = await Promise.all([
      fetchBytes("assets/montserrat-700.ttf"),
      fetchBytes("assets/base_plaquinha.png"),
    ]);
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });
    const bgImg = await pdfDoc.embedPng(pngBytes);

    let page = null;
    itens.forEach((nome, n) => {
      const slot = n % 8;
      if (slot === 0) page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      drawCard(page, font, bgImg, COLS_X[slot % 2], ROWS_Y[Math.floor(slot / 2)], nome);
    });

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plaquinhas-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    registrarFeitos(itens, "placa");
    statusEl.textContent = `Pronto: ${itens.length} plaquinhas, ${Math.ceil(itens.length / 8)} folha(s).`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Erro ao gerar PDF: " + err.message;
  } finally {
    btn.disabled = false;
  }
}
