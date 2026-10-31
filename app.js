const CONFIG = window.RADAR_CONFIG;
const $ = (id) => document.getElementById(id);
const ETAPA_REUNIAO = 'Reunião marcada';
const SEM_MOVIMENTO = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- dados locais ---------- */
function le(k, padrao) { try { return JSON.parse(localStorage.getItem(k)) || padrao; } catch (e) { return padrao; } }
function grava(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

let leads = le('radar.leads', []);
let conexao = le('radar.conexao', {});
if (CONFIG.endpoint && !conexao.url) conexao.url = CONFIG.endpoint;
let estadoSync = { erro: '', ultimo: 0 };
let filtro = { etapa: '', tipo: '', servico: '', busca: '' };

const ativos = () => leads.filter((l) => !l._del);
const salvaLocal = () => grava('radar.leads', leads);
function marca(l) { l._pend = true; l._rev = Date.now() + '-' + Math.random(); }

function novoId() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (n) => n.toString(36).padStart(2, '0')).join('').slice(0, 16);
}
function agoraLocal() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

/* ---------- formatos ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const ico = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const digitos = (s) => String(s || '').replace(/\D/g, '');
function fmtTel(v) {
  const d = digitos(v);
  if (String(v).trim().charAt(0) === '+' || d.length > 11) return String(v);
  if (d.length <= 2) return d ? '(' + d : '';
  const fim = d.length === 11 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, fim)}${d.length > fim ? '-' + d.slice(fim) : ''}`;
}
function telOk(v) { const n = digitos(v).length; return n >= 10 && n <= 13; }
const emailOk = (v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v);
function whats(t) { const d = digitos(t); return 'https://wa.me/' + (d.length <= 11 ? '55' + d : d); }
function dataDe(s) { const d = new Date(s); return s && !isNaN(d) ? d : null; }
const hora = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function dia(d) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dif = Math.round((x - hoje) / 864e5);
  if (dif === 0) return 'Hoje';
  if (dif === 1) return 'Amanhã';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '');
}
function iniciais(nome) {
  const p = String(nome).trim().split(/\s+/);
  return ((p[0] || '')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function linkAgenda(l) {
  const d = dataDe(l.reuniao);
  if (!d) return '';
  const f = (x) => new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().replace(/[-:]/g, '').slice(0, 15);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Reunião Trevi: ' + l.nome) +
    '&dates=' + f(d) + '/' + f(new Date(d.getTime() + 36e5)) +
    '&details=' + encodeURIComponent(`${l.servico}\n${l.telefone}\n${l.email}`);
}

/* só toca no DOM quando algo mudou: a sincronização não pisca a tela */
function poe(el, html) {
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
}

/* ---------- opções vindas do config.js ---------- */
const seletorTipo = (box, nome) => {
  box.innerHTML = CONFIG.tipos.map((t) =>
    `<label><input type="radio" name="${nome}" value="${t.id}"><span><b><i class="pt ${t.id}"></i>${t.id}</b><small>${t.dica}</small></span></label>`).join('');
  let marcado = null;
  /* é opcional: tocar de novo desmarca */
  box.addEventListener('click', (e) => {
    const i = e.target.closest('input');
    if (!i) return;
    if (marcado === i) { i.checked = false; marcado = null; } else marcado = i;
  });
  return {
    valor: () => (marcado ? marcado.value : ''),
    define(v) {
      marcado = box.querySelector(`input[value="${v}"]`);
      box.querySelectorAll('input').forEach((i) => { i.checked = i === marcado; });
    }
  };
};
const tipoForm = seletorTipo($('f-tipos'), 'f-tipo');
const tipoFicha = seletorTipo($('d-tipos'), 'd-tipo');

$('f-servicos').innerHTML = CONFIG.servicos.concat('Outro').map((s) =>
  `<label class="chip"><input type="radio" name="f-servico" value="${esc(s)}"><span>${esc(s)}</span></label>`).join('');
$('d-etapas').innerHTML = CONFIG.etapas.map((e) =>
  `<label class="chip"><input type="radio" name="d-etapa" value="${esc(e)}"><span>${esc(e)}</span></label>`).join('');
$('f-tipo-filtro').innerHTML = CONFIG.tipos.map((t) =>
  `<button class="pil" type="button" data-tipo="${t.id}" aria-pressed="false"><i class="pt ${t.id}"></i>${t.id}</button>`).join('');

/* ---------- cadastro ---------- */
function marcaErro(raiz, c, tem) {
  const el = raiz.querySelector(`[data-c="${c}"]`);
  if (el) el.classList.toggle('err', tem);
  return tem;
}
function duplicado(tel, email, ignora) {
  const t = digitos(tel), e = email.toLowerCase();
  return ativos().find((l) => l.id !== ignora && (digitos(l.telefone) === t || String(l.email).toLowerCase() === e));
}
const servicoMarcado = () => (document.querySelector('input[name=f-servico]:checked') || {}).value || '';

function fechaReuniao() {
  $('f-reuniao-box').classList.remove('on');
  $('f-reuniao').value = '';
}

$('form').addEventListener('submit', function (ev) {
  ev.preventDefault();
  const nome = $('f-nome').value.trim(), tel = $('f-tel').value.trim(), email = $('f-email').value.trim();
  let servico = servicoMarcado();
  if (servico === 'Outro') servico = $('f-outro').value.trim();
  const temReuniao = $('f-tem-reuniao').checked;
  const reuniao = temReuniao ? $('f-reuniao').value : '';

  const ruins = [
    marcaErro(this, 'nome', !nome) && $('f-nome'),
    marcaErro(this, 'telefone', !telOk(tel)) && $('f-tel'),
    marcaErro(this, 'email', !emailOk(email)) && $('f-email'),
    marcaErro(this, 'servico', !servico) && $('f-servicos'),
    marcaErro(this, 'reuniao', temReuniao && !reuniao) && $('f-reuniao')
  ].filter(Boolean);
  if (ruins.length) {
    ruins[0].scrollIntoView({ block: 'center', behavior: SEM_MOVIMENTO ? 'auto' : 'smooth' });
    if (ruins[0].focus) ruins[0].focus({ preventScroll: true });
    return;
  }

  const dup = duplicado(tel, email);
  if (dup) { aviso(`${dup.nome} já está no radar.`); return; }

  const l = {
    id: novoId(), criado_em: agoraLocal(), nome, telefone: tel, email, servico,
    tipo: tipoForm.valor(), etapa: reuniao ? ETAPA_REUNIAO : 'Novo', reuniao, obs: $('f-obs').value.trim()
  };
  marca(l);
  leads.push(l);
  salvaLocal();

  this.reset();
  tipoForm.define('');
  fechaReuniao();
  $('f-outro-box').hidden = true;
  $('f-obs').style.height = '';
  document.activeElement.blur();

  pinta();
  radar.ping(l.id);
  window.scrollTo({ top: 0, behavior: SEM_MOVIMENTO ? 'auto' : 'smooth' });

  const n = ativos().length, falta = CONFIG.meta - n, primeiro = nome.split(' ')[0];
  if (falta === 0) radar.celebra();
  aviso(falta > 0 ? `${primeiro} no radar. Falta${falta > 1 ? 'm' : ''} ${falta}.` : falta === 0 ? `Meta batida: ${n} de ${CONFIG.meta}.` : `${primeiro} no radar. ${n} leads.`);
  sincroniza();
});

[$('f-tel'), $('d-tel')].forEach((i) => i.addEventListener('input', () => { i.value = fmtTel(i.value); }));
[$('f-obs'), $('d-obs')].forEach((t) => t.addEventListener('input', () => cresceTexto(t)));
function cresceTexto(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

$('f-tem-reuniao').addEventListener('change', function () {
  $('f-reuniao-box').classList.toggle('on', this.checked);
  if (this.checked) $('f-reuniao').focus({ preventScroll: true });
  else { fechaReuniao(); marcaErro($('form'), 'reuniao', false); }
});
$('form').addEventListener('input', (e) => {
  const c = e.target.closest('[data-c]');
  if (c) c.classList.remove('err');
});
$('f-servicos').addEventListener('change', () => {
  const outro = servicoMarcado() === 'Outro';
  $('f-outro-box').hidden = !outro;
  if (outro) $('f-outro').focus();
});

/* ---------- abas ---------- */
function abre(aba) {
  const cad = aba === 'cadastro';
  document.body.dataset.aba = aba;
  $('v-cadastro').hidden = !cad;
  $('v-cadastrados').hidden = cad;
  $('t-cadastro').setAttribute('aria-selected', cad);
  $('t-cadastrados').setAttribute('aria-selected', !cad);
  window.scrollTo(0, 0);
}
$('t-cadastro').addEventListener('click', () => abre('cadastro'));
$('t-cadastrados').addEventListener('click', () => abre('cadastrados'));
/* a meta segue visível no topo da folha quando ela cobre o radar */
window.addEventListener('scroll', () => {
  const topo = document.querySelector('.folha').offsetTop;
  document.body.classList.toggle('coberto', window.scrollY > topo - 150);
  document.body.classList.toggle('presa', window.scrollY >= topo);
}, { passive: true });

/* ---------- cadastrados ---------- */
function passa(l) {
  if (filtro.etapa && l.etapa !== filtro.etapa) return false;
  if (filtro.tipo && l.tipo !== filtro.tipo) return false;
  if (filtro.servico && l.servico !== filtro.servico) return false;
  if (filtro.busca) {
    const q = filtro.busca.toLowerCase(), d = digitos(filtro.busca);
    if (!`${l.nome} ${l.email}`.toLowerCase().includes(q) && !(d && digitos(l.telefone).includes(d))) return false;
  }
  return true;
}

function pintaFunil(todos) {
  const contagem = CONFIG.etapas.map((e) => todos.filter((l) => l.etapa === e).length);
  const maior = Math.max(1, ...contagem);
  $('c-resumo').textContent = `${todos.length} ${todos.length === 1 ? 'lead' : 'leads'}`;
  poe($('funil'), CONFIG.etapas.map((e, i) => {
    const n = contagem[i];
    const altura = n ? 8 + Math.round(n / maior * 64) : 3;
    const classe = e === 'Fechado' && n ? ' prova' : e === 'Perdido' ? ' fora' : '';
    return `<button class="col${classe}" type="button" data-etapa="${esc(e)}" aria-pressed="${filtro.etapa === e}" aria-label="${esc(e)}: ${n}"><b>${n}</b><i style="height:${altura}px"></i><span>${esc(e)}</span></button>`;
  }).join(''));
}

function pintaFiltros(todos) {
  document.querySelectorAll('[data-tipo]').forEach((b) => b.setAttribute('aria-pressed', filtro.tipo === b.dataset.tipo));
  const servicos = [...new Set(CONFIG.servicos.concat(todos.map((l) => l.servico)).filter(Boolean))];
  const sel = $('f-servico-filtro');
  poe(sel, '<option value="">Serviço</option>' + servicos.map((s) => `<option>${esc(s)}</option>`).join(''));
  sel.value = filtro.servico;
  sel.classList.toggle('on', !!filtro.servico);
}

function pintaAgenda(visiveis, filtrando) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const marcadas = visiveis
    .filter((l) => { const d = dataDe(l.reuniao); return d && d >= hoje && l.etapa !== 'Perdido'; })
    .sort((a, b) => dataDe(a.reuniao) - dataDe(b.reuniao));

  $('agenda-bloco').hidden = filtrando && !marcadas.length;
  $('c-agenda').textContent = marcadas.length ? `${marcadas.length} ${marcadas.length === 1 ? 'reunião' : 'reuniões'}` : '';
  let ultimo = '';
  poe($('agenda'), marcadas.length ? marcadas.map((l) => {
    const d = dataDe(l.reuniao), rotulo = dia(d);
    const cab = rotulo !== ultimo ? `<p class="dia">${esc(rotulo)}</p>` : '';
    ultimo = rotulo;
    return `${cab}<div class="reuniao"><time class="hora">${hora(d)}</time>` +
      `<button class="quem" type="button" data-abre="${esc(l.id)}"><b>${esc(l.nome)}</b><span>${esc(l.tipo || 'Sem classificação')} · ${esc(l.servico)}</span></button>` +
      `<a class="ico" href="${esc(linkAgenda(l))}" target="_blank" rel="noopener" aria-label="Adicionar ao Google Agenda">${ico('agenda-mais')}</a></div>`;
  }).join('') : '<p class="vazio">Nenhuma reunião marcada ainda.</p>');
}

function pintaLista(visiveis, todos, filtrando) {
  const ordem = visiveis.slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  $('c-lista').textContent = filtrando ? `${visiveis.length} de ${todos.length}` : '';
  const vazio = filtrando
    ? '<p class="vazio">Nenhum lead com esses filtros.</p>'
    : '<div class="vazio"><p>Nenhum lead no radar ainda.</p><button class="sec" type="button" data-ir="cadastro">Cadastrar o primeiro</button></div>';
  poe($('lista'), ordem.length ? ordem.map((l) => {
    const d = dataDe(l.reuniao);
    return `<article class="lead"><button class="lead-abre" type="button" data-abre="${esc(l.id)}">` +
      `<span class="avatar">${esc(iniciais(l.nome))}</span>` +
      `<span class="lead-txt"><b>${esc(l.nome)}</b><span>${esc(l.servico)}${d ? ` · ${esc(dia(d))} ${hora(d)}` : ''}</span><span class="tags">` +
      (l.tipo ? `<span class="tag ${esc(l.tipo)}">${esc(l.tipo)}</span>` : '') +
      `<span class="tag etapa">${esc(l.etapa)}</span>` +
      (l._pend && conexao.url ? '<span class="tag fila">na fila</span>' : '') +
      `</span></span></button>` +
      `<a class="ico" href="${esc(whats(l.telefone))}" target="_blank" rel="noopener" aria-label="Abrir WhatsApp de ${esc(l.nome)}">${ico('conversa')}</a></article>`;
  }).join('') : vazio);
}

function pintaCadastrados() {
  const todos = ativos(), visiveis = todos.filter(passa);
  const filtrando = !!(filtro.etapa || filtro.tipo || filtro.servico || filtro.busca);
  pintaFunil(todos);
  pintaFiltros(todos);
  pintaAgenda(visiveis, filtrando);
  pintaLista(visiveis, todos, filtrando);
  $('limpa').hidden = !filtrando;
}

$('funil').addEventListener('click', (e) => {
  const b = e.target.closest('[data-etapa]');
  if (!b) return;
  filtro.etapa = filtro.etapa === b.dataset.etapa ? '' : b.dataset.etapa;
  pintaCadastrados();
});
$('f-tipo-filtro').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tipo]');
  if (!b) return;
  filtro.tipo = filtro.tipo === b.dataset.tipo ? '' : b.dataset.tipo;
  pintaCadastrados();
});
$('f-servico-filtro').addEventListener('change', (e) => { filtro.servico = e.target.value; pintaCadastrados(); });
$('busca').addEventListener('input', (e) => { filtro.busca = e.target.value.trim(); pintaCadastrados(); });
$('limpa').addEventListener('click', () => {
  filtro = { etapa: '', tipo: '', servico: '', busca: '' };
  $('busca').value = '';
  pintaCadastrados();
});
$('v-cadastrados').addEventListener('click', (e) => {
  const b = e.target.closest('[data-abre]');
  if (b) abreLead(b.dataset.abre);
  const ir = e.target.closest('[data-ir]');
  if (ir) abre(ir.dataset.ir);
});

/* ---------- ficha do lead ---------- */
let aberto = null, confirmando = false;

function abreGaveta(d) {
  d.showModal();
  d.scrollTop = 0;
  d.focus();
}

function abreLead(id) {
  const l = ativos().find((x) => x.id === id);
  if (!l) return;
  aberto = id;
  confirmando = false;
  $('d-excluir').textContent = 'Excluir lead';
  $('d-avatar').textContent = iniciais(l.nome);
  $('d-titulo').textContent = l.nome;
  $('d-sub').textContent = l.servico;

  const etapa = document.querySelector(`input[name=d-etapa][value="${l.etapa}"]`);
  document.querySelectorAll('input[name=d-etapa]').forEach((i) => { i.checked = i === etapa; });
  tipoFicha.define(l.tipo || '');

  $('d-reuniao').value = l.reuniao || '';
  $('d-sem-reuniao').hidden = !l.reuniao;
  $('d-nome').value = l.nome;
  $('d-tel').value = l.telefone;
  $('d-email').value = l.email;
  const servicos = [...new Set(CONFIG.servicos.concat(l.servico))];
  $('d-servico').innerHTML = servicos.map((s) => `<option>${esc(s)}</option>`).join('');
  $('d-servico').value = l.servico;
  $('d-obs').value = l.obs || '';

  const atalho = (href, icone, rotulo, novaAba) =>
    `<a class="atalho" href="${esc(href)}"${novaAba ? ' target="_blank" rel="noopener"' : ''}>${ico(icone)}${rotulo}</a>`;
  $('d-atalhos').innerHTML =
    atalho(whats(l.telefone), 'conversa', 'WhatsApp', true) +
    atalho('tel:+' + digitos(whats(l.telefone)), 'fone', 'Ligar') +
    atalho('mailto:' + l.email, 'email', 'E-mail') +
    (l.reuniao ? atalho(linkAgenda(l), 'agenda-mais', 'Agenda', true) : '');

  $('d-form').querySelectorAll('.err').forEach((x) => x.classList.remove('err'));
  abreGaveta($('d-lead'));
  cresceTexto($('d-obs'));
}

$('d-reuniao').addEventListener('input', (e) => { $('d-sem-reuniao').hidden = !e.target.value; });
$('d-sem-reuniao').addEventListener('click', function () {
  $('d-reuniao').value = '';
  this.hidden = true;
});

$('d-form').addEventListener('submit', function (ev) {
  ev.preventDefault();
  const l = leads.find((x) => x.id === aberto);
  if (!l) return;
  const nome = $('d-nome').value.trim(), tel = $('d-tel').value.trim(), email = $('d-email').value.trim();
  const ruim = [
    marcaErro(this, 'nome', !nome),
    marcaErro(this, 'telefone', !telOk(tel)),
    marcaErro(this, 'email', !emailOk(email))
  ].some(Boolean);
  if (ruim) return;
  const dup = duplicado(tel, email, l.id);
  if (dup) { aviso(`Telefone ou e-mail já é de ${dup.nome}.`); return; }

  const reuniao = $('d-reuniao').value;
  let etapa = (document.querySelector('input[name=d-etapa]:checked') || {}).value || l.etapa;
  /* marcar reunião avança o funil de quem ainda estava antes dessa etapa */
  if (reuniao && !l.reuniao && (etapa === 'Novo' || etapa === 'Contato feito')) etapa = ETAPA_REUNIAO;

  Object.assign(l, { nome, telefone: tel, email, servico: $('d-servico').value, tipo: tipoFicha.valor(), etapa, reuniao, obs: $('d-obs').value.trim() });
  marca(l);
  salvaLocal();
  $('d-lead').close();
  pinta();
  sincroniza();
});

$('d-excluir').addEventListener('click', function () {
  if (!confirmando) { confirmando = true; this.textContent = 'Toque de novo para excluir'; return; }
  const l = leads.find((x) => x.id === aberto);
  if (!l) return;
  l._del = true;
  marca(l);
  salvaLocal();
  $('d-lead').close();
  pinta();
  sincroniza();
});

document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.querySelector('[data-fecha]').addEventListener('click', () => d.close());
});

/* ---------- planilha ---------- */
const publico = ({ id, criado_em, nome, telefone, email, servico, tipo, etapa, reuniao, obs }) =>
  ({ id, criado_em, nome, telefone, email, servico, tipo, etapa, reuniao, obs });

let ocupado = false, repete = false;

async function sincroniza() {
  if (!conexao.url || !conexao.codigo) { pintaStatus(); return; }
  if (ocupado) { repete = true; return; }
  ocupado = true;
  const pend = leads.filter((l) => l._pend);
  const enviados = Object.fromEntries(pend.map((l) => [l.id, l._rev]));
  try {
    const r = await fetch(conexao.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita o preflight, que o Apps Script não responde
      body: JSON.stringify({
        acao: 'sincronizar',
        codigo: conexao.codigo,
        salvar: pend.filter((l) => !l._del).map(publico),
        excluir: pend.filter((l) => l._del).map((l) => l.id)
      })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || 'erro');
    /* a planilha é a fonte; só fica de fora o que mudou enquanto a resposta vinha */
    const novos = leads.filter((l) => l._pend && enviados[l.id] !== l._rev);
    const ids = new Set(novos.map((l) => l.id));
    leads = d.leads.filter((l) => !ids.has(l.id)).concat(novos);
    salvaLocal();
    estadoSync = { erro: '', ultimo: Date.now() };
  } catch (e) {
    estadoSync.erro = /^codigo/.test(e.message) ? 'codigo' : 'rede';
  }
  ocupado = false;
  pinta();
  if (repete) { repete = false; sincroniza(); }
}

function pintaStatus() {
  const pend = leads.filter((l) => l._pend).length;
  let s, m;
  if (!conexao.url || !conexao.codigo) { s = 'local'; m = 'Conectar planilha'; }
  else if (estadoSync.erro === 'codigo') { s = 'erro'; m = 'Código incorreto'; }
  else if (estadoSync.erro === 'rede') { s = 'fila'; m = pend ? `${pend} na fila, sem conexão` : 'Sem conexão'; }
  else if (pend) { s = 'fila'; m = `Enviando ${pend}`; }
  else if (estadoSync.ultimo) { s = 'ok'; m = 'Planilha em dia'; }
  else { s = 'fila'; m = 'Conectando'; }
  $('status').dataset.s = s;
  $('status-t').textContent = m;
  if ($('d-sync').open) {
    $('s-info').textContent =
      s === 'ok' ? `Conectado. ${ativos().length} leads na planilha.` :
      s === 'erro' ? 'A planilha recusou o código. Confira o CODIGO no Apps Script.' :
      estadoSync.erro === 'rede' ? 'Não foi possível falar com a planilha. Os leads seguem salvos aqui e sobem quando a conexão voltar.' : '';
  }
}

$('status').addEventListener('click', () => {
  $('s-url').value = conexao.url || '';
  $('s-cod').value = conexao.codigo || '';
  $('s-info').textContent = '';
  abreGaveta($('d-sync'));
  pintaStatus();
});
$('s-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const url = $('s-url').value.trim(), cod = $('s-cod').value.trim();
  if (!/^https?:\/\//.test(url) || !cod) { $('s-info').textContent = 'Preencha a URL e o código.'; return; }
  conexao = { url, codigo: cod };
  grava('radar.conexao', conexao);
  estadoSync = { erro: '', ultimo: 0 };
  $('s-info').textContent = 'Sincronizando...';
  sincroniza();
});
window.addEventListener('online', sincroniza);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sincroniza(); });
setInterval(() => { if (!document.hidden) sincroniza(); }, CONFIG.syncSegundos * 1000);

/* ---------- painel da meta ---------- */
const radar = window.RadarVisual($('radar'));
let numero = 0, quadroNumero = 0;

function contaAte(alvo, ms) {
  cancelAnimationFrame(quadroNumero);
  if (SEM_MOVIMENTO || alvo === numero) { numero = alvo; $('p-n').textContent = alvo; return; }
  const de = numero, ini = performance.now();
  const passo = (t) => {
    const f = Math.min(1, (t - ini) / ms);
    numero = Math.round(de + (alvo - de) * (1 - Math.pow(1 - f, 3)));
    $('p-n').textContent = numero;
    if (f < 1) quadroNumero = requestAnimationFrame(passo);
  };
  quadroNumero = requestAnimationFrame(passo);
}

let primeiraPintura = true;
function pintaPainel() {
  const a = ativos(), n = a.length, m = CONFIG.meta, falta = m - n;
  contaAte(n, primeiraPintura ? 1400 : 500);
  primeiraPintura = false;
  radar.dados(a, m);

  $('p-m').textContent = m;
  $('n-aba').textContent = n;
  document.querySelectorAll('[data-placar]').forEach((el) => { el.textContent = `${n}/${m}`; });
  $('radar').setAttribute('aria-label', `Radar com ${n} de ${m} leads da meta`);

  $('p-falta').hidden = falta <= 0;
  $('p-selo').hidden = falta > 0;
  $('p-falta').textContent = falta === 1 ? 'Falta 1 para a meta' : `Faltam ${falta} para a meta`;
  $('p-selo').textContent = falta === 0 ? 'Meta batida' : `Meta batida, ${-falta} acima`;

  poe($('p-leg'), CONFIG.tipos.map((t) =>
    `<span><i class="pt ${t.id}"></i>${t.id} <b>${a.filter((l) => l.tipo === t.id).length}</b></span>`).join(''));
}

function pinta() {
  pintaPainel();
  pintaCadastrados();
  pintaStatus();
}

let tempoAviso;
function aviso(m) {
  const t = $('toast');
  t.innerHTML = ico('ok') + esc(m);
  t.classList.add('on');
  clearTimeout(tempoAviso);
  tempoAviso = setTimeout(() => t.classList.remove('on'), 3200);
}

pinta();
sincroniza();
