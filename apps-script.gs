/* Radar: guarda os leads do evento na planilha e devolve a lista para o app.

   Como instalar:
   1. Crie uma planilha nova. Extensões → Apps Script. Apague o que estiver lá e cole este arquivo.
   2. Em CONFIG, troque CODIGO por uma senha só sua (12 caracteres ou mais).
   3. Implantar → Nova implantação → App da Web.
      Executar como: Eu · Quem pode acessar: Qualquer pessoa.
   4. No Radar, toque no status do topo e cole a URL que termina em /exec e o código.
   A aba e o cabeçalho são criados no primeiro envio.
   Ao mudar este código, use Implantar → Gerenciar implantações → Editar → Nova versão.

   "Qualquer pessoa" só libera o endereço: sem o CODIGO nada é lido nem gravado. */

var CONFIG = {
  ABA: 'Leads',
  CODIGO: ''      // sem código o script recusa tudo, de propósito
};

/* precisam ser iguais aos do config.js */
var TIPOS = ['Quente', 'Morno', 'Frio'];
var ETAPAS = ['Novo', 'Contato feito', 'Reunião marcada', 'Proposta', 'Fechado', 'Perdido'];

var COLUNAS = [
  { k: 'id',        t: 'ID' },
  { k: 'criado_em', t: 'Cadastrado em', data: true },
  { k: 'nome',      t: 'Nome' },
  { k: 'telefone',  t: 'Telefone' },
  { k: 'email',     t: 'E-mail' },
  { k: 'servico',   t: 'Serviço de interesse' },
  { k: 'tipo',      t: 'Tipo de interessado' },
  { k: 'etapa',     t: 'Etapa do funil' },
  { k: 'reuniao',   t: 'Reunião', data: true },
  { k: 'obs',       t: 'Observação' }
];

function doGet() { return json({ ok: true, app: 'radar' }); }   // serve só para testar a URL: não devolve dados

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var d = JSON.parse(e.postData.contents);
    if (!CONFIG.CODIGO) return json({ ok: false, erro: 'codigo_nao_configurado' });
    if (String(d.codigo || '') !== CONFIG.CODIGO) return json({ ok: false, erro: 'codigo' });
    if (d.acao !== 'sincronizar') return json({ ok: false, erro: 'acao' });

    lock.waitLock(25000);
    var aba = prepara();
    salva(aba, Array.isArray(d.salvar) ? d.salvar : []);
    exclui(aba, Array.isArray(d.excluir) ? d.excluir : []);
    return json({ ok: true, leads: lista(aba) });
  } catch (err) {
    return json({ ok: false, erro: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- planilha ---------- */

function prepara() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.ABA) || ss.insertSheet(CONFIG.ABA);
  var cab = cabecalho(aba), nova = !cab.length;

  COLUNAS.forEach(function (c) {
    if (cab.indexOf(c.t) < 0) {
      cab.push(c.t);
      aba.getRange(1, cab.length).setValue(c.t).setFontWeight('bold');
    }
  });

  if (nova) {
    aba.setFrozenRows(1);
    aba.hideColumns(cab.indexOf('ID') + 1);
    lista_suspensa(aba, cab.indexOf('Tipo de interessado') + 1, TIPOS);
    lista_suspensa(aba, cab.indexOf('Etapa do funil') + 1, ETAPAS);
  }
  return aba;
}

function lista_suspensa(aba, col, valores) {
  var regra = SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(true).build();
  aba.getRange(2, col, aba.getMaxRows() - 1, 1).setDataValidation(regra);
}

function cabecalho(aba) {
  var n = aba.getLastColumn();
  return n ? aba.getRange(1, 1, 1, n).getValues()[0].map(String).filter(String) : [];
}

function linhas(aba, cab) {
  var ult = aba.getLastRow();
  return ult < 2 ? [] : aba.getRange(2, 1, ult - 1, cab.length).getValues();
}

/* cria ou atualiza pelo id, então reenviar o mesmo lead nunca duplica */
function salva(aba, itens) {
  if (!itens.length) return;
  var cab = cabecalho(aba), cId = cab.indexOf('ID'), dados = linhas(aba, cab), pos = {};
  dados.forEach(function (l, i) { pos[String(l[cId])] = i + 2; });

  itens.forEach(function (it) {
    if (!/^[a-z0-9]{16}$/.test(String(it.id || '')) || !limpa(it.nome)) return;
    var n = pos[it.id], atual = n ? dados[n - 2].slice() : cab.map(function () { return ''; });

    COLUNAS.forEach(function (c) {
      atual[cab.indexOf(c.t)] = c.data ? paraPlanilha(it[c.k]) : celula(it[c.k]);
    });

    if (!n) { n = aba.getLastRow() + 1; pos[it.id] = n; }
    aba.getRange(n, 1, 1, cab.length)
      .setNumberFormat('@')       // texto puro: telefone não vira número nem perde o zero
      .setValues([atual]);
  });
}

function exclui(aba, ids) {
  if (!ids.length) return;
  var cab = cabecalho(aba), cId = cab.indexOf('ID'), alvo = {};
  ids.forEach(function (id) { alvo[String(id)] = 1; });
  var dados = linhas(aba, cab);
  for (var i = dados.length - 1; i >= 0; i--) {   // de baixo para cima, para não deslocar as linhas
    if (alvo[String(dados[i][cId])]) aba.deleteRow(i + 2);
  }
}

function lista(aba) {
  var cab = cabecalho(aba);
  return linhas(aba, cab).filter(function (l) { return l[cab.indexOf('ID')]; }).map(function (l) {
    var o = {};
    COLUNAS.forEach(function (c) {
      var v = l[cab.indexOf(c.t)];
      o[c.k] = c.data ? paraApp(v) : leitura(v);
    });
    return o;
  });
}

/* ---------- formatos ---------- */

/* app usa 2026-10-31T15:00; a planilha mostra 31/10/2026 15:00 */
function paraPlanilha(v) {
  var m = limpa(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:\d{2})?/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] + (m[6] || '') : '';
}

function paraApp(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");
  var m = limpa(v).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(:\d{2})?/);
  if (!m) return '';
  var h = m[4].length === 1 ? '0' + m[4] : m[4];
  return m[3] + '-' + m[2] + '-' + m[1] + 'T' + h + ':' + m[5] + (m[6] || '');
}

function celula(v) {
  v = limpa(v).slice(0, 2000);
  return /^[=+\-@]/.test(v) ? "'" + v : v;   // impede que o texto vire fórmula
}

function leitura(v) { return limpa(v).replace(/^'(?=[=+\-@])/, ''); }

function limpa(v) { return (typeof v === 'string' ? v : (v == null ? '' : String(v))).trim(); }

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
