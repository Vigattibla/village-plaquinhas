// Cole este código em Extensões > Apps Script da planilha de controle e implante como "App da Web".
const ABA = "Registro";
const CABECALHO = ["Data/hora", "Chave", "Item", "Tipo", "Qtd"];

function aba_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ABA);
  if (!sh) {
    sh = ss.insertSheet(ABA);
    sh.appendRow(CABECALHO);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  const sh = aba_();
  const n = sh.getLastRow() - 1;
  const linhas = n > 0 ? sh.getRange(2, 1, n, 5).getValues() : [];
  return json_({ ok: true, linhas: linhas.map(r => ({
    data: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
    chave: String(r[1]), nome: String(r[2]), tipo: String(r[3]), qtd: Number(r[4]) || 1,
  })) });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const req = JSON.parse(e.postData.contents);
    const sh = aba_();
    if (req.acao === "registrar") {
      const agora = new Date();
      const rows = (req.itens || []).map(i => [i.data ? new Date(i.data) : agora, i.chave, i.nome, i.tipo, i.qtd || 1]);
      if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
      return json_({ ok: true, gravados: rows.length });
    }
    if (req.acao === "apagar") {
      const n = sh.getLastRow() - 1;
      if (n > 0) {
        const chaves = sh.getRange(2, 2, n, 1).getValues();
        for (let i = chaves.length - 1; i >= 0; i--) if (chaves[i][0] === req.chave) sh.deleteRow(i + 2);
      }
      return json_({ ok: true });
    }
    return json_({ ok: false, erro: "ação desconhecida" });
  } catch (err) {
    return json_({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}
