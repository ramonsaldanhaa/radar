/* O instrumento: gira, acende os leads e fecha a borda conforme a meta avança.
   Só desenha. Os dados chegam de fora por dados(), ping() e celebra(). */
window.RadarVisual = function (cv) {
  const ctx = cv.getContext('2d');
  const TAU = Math.PI * 2;
  const TOPO = -Math.PI / 2;
  const VOLTA = 6000;
  const parado = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MENTA = '168,213,181';
  const PAPEL = '#F7F8F5';
  const AMBAR = '#E9A23B';
  const COR = { Quente: '#FF7A5C', Morno: '#F6D76B', Frio: '#A8D5B5' };

  /* quanto mais quente o lead, mais perto do centro */
  const CUBO = 0.36;
  const ANEIS = [CUBO, 0.575, 0.79, 1];
  const FAIXA = { Quente: 0.468, Morno: 0.682, Frio: 0.895 };

  const halos = {};
  const pings = {};
  let pontos = [];
  let meta = 10;
  let S = 0, c = 0, R = 0, RB = 0;
  let base = null;
  let prog = 0, antes = 0, festa = 0;

  function hash(s) {
    let h = 7;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function halo(cor) {
    if (halos[cor]) return halos[cor];
    const t = document.createElement('canvas');
    t.width = t.height = 96;
    const x = t.getContext('2d');
    const g = x.createRadialGradient(48, 48, 0, 48, 48, 48);
    g.addColorStop(0, cor + 'CC');
    g.addColorStop(0.3, cor + '55');
    g.addColorStop(1, cor + '00');
    x.fillStyle = g;
    x.fillRect(0, 0, 96, 96);
    return (halos[cor] = t);
  }

  /* o que não se move fica pronto numa camada só, para poupar bateria */
  function preparaBase() {
    base = document.createElement('canvas');
    base.width = base.height = S;
    const b = base.getContext('2d');
    const fino = Math.max(1, S / 440);

    b.beginPath();
    b.arc(c, c, R, 0, TAU);
    b.fillStyle = 'rgba(26,58,42,.42)';
    b.fill();

    b.lineWidth = fino;
    b.strokeStyle = `rgba(${MENTA},.17)`;
    ANEIS.forEach((k) => { b.beginPath(); b.arc(c, c, R * k, 0, TAU); b.stroke(); });

    b.strokeStyle = `rgba(${MENTA},.1)`;
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4;
      b.beginPath();
      b.moveTo(c + Math.cos(a) * R * CUBO, c + Math.sin(a) * R * CUBO);
      b.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
      b.stroke();
    }

    for (let i = 0; i < 72; i++) {
      const a = i * TAU / 72;
      const forte = i % 6 === 0;
      const l = forte ? S * 0.02 : S * 0.009;
      b.strokeStyle = `rgba(${MENTA},${forte ? 0.4 : 0.16})`;
      b.beginPath();
      b.moveTo(c + Math.cos(a) * (R - l), c + Math.sin(a) * (R - l));
      b.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
      b.stroke();
    }
  }

  function ajusta() {
    const w = cv.clientWidth;
    if (!w) return;
    const lado = Math.round(w * Math.min(window.devicePixelRatio || 1, 2));
    if (cv.width === lado && cv.height === lado && base) return;
    cv.width = cv.height = S = lado;
    c = S / 2;
    RB = S / 2 - S * 0.012;
    R = RB - S * 0.034;
    preparaBase();
    if (parado) desenha(performance.now());
  }

  function rastro(th) {
    if (!ctx.createConicGradient) return;
    const g = ctx.createConicGradient(th + TOPO, c, c);
    g.addColorStop(0, `rgba(${MENTA},0)`);
    g.addColorStop(0.58, `rgba(${MENTA},0)`);
    g.addColorStop(0.9, `rgba(${MENTA},.1)`);
    g.addColorStop(1, `rgba(${MENTA},.36)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TAU);
    ctx.arc(c, c, R * CUBO, 0, TAU);
    ctx.fill('evenodd');
  }

  function feixe(th) {
    const a = th + TOPO;
    const x0 = c + Math.cos(a) * R * CUBO, y0 = c + Math.sin(a) * R * CUBO;
    const x1 = c + Math.cos(a) * R, y1 = c + Math.sin(a) * R;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(247,248,245,.2)');
    g.addColorStop(1, 'rgba(247,248,245,.95)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1, S / 300);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function circulo(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function nome(p, x, y, forca) {
    ctx.font = `600 ${Math.round(Math.max(S * 0.036, 11))}px "Instrument Sans", system-ui, sans-serif`;
    const larg = ctx.measureText(p.nome).width;
    const folga = S * 0.028;
    let lado = x < c ? -1 : 1;                                 // para fora, longe do visor
    if (Math.abs(x + lado * (folga + larg) - c) > R * 0.97) lado = -lado;   // sem sair do disco
    ctx.textAlign = lado > 0 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = forca;
    ctx.fillStyle = PAPEL;
    ctx.fillText(p.nome, x + lado * folga, y);
  }

  function lead(p, th, t) {
    const a = p.a + TOPO;
    const x = c + Math.cos(a) * R * p.r;
    const y = c + Math.sin(a) * R * p.r;
    const idade = parado ? 0.3 : (((th - p.a) % TAU) + TAU) % TAU / TAU;
    const brilho = Math.pow(1 - idade, 2.4);

    const h = S * (0.075 + 0.1 * brilho);
    ctx.globalAlpha = 0.3 + 0.7 * brilho;
    ctx.drawImage(halo(p.cor), x - h / 2, y - h / 2, h, h);

    ctx.globalAlpha = 0.5 + 0.5 * brilho;
    ctx.fillStyle = p.cor;
    circulo(x, y, S * 0.0125);

    ctx.globalAlpha = brilho;
    ctx.fillStyle = PAPEL;
    circulo(x, y, S * 0.0055);

    if (pings[p.id] != null) {
      const f = (t - pings[p.id]) / 1900;
      if (f >= 1) delete pings[p.id];
      else {
        ctx.strokeStyle = AMBAR;
        ctx.lineWidth = Math.max(1.5, S / 190);
        [0, 0.26].forEach((atraso) => {
          const g = f - atraso;
          if (g <= 0) return;
          const e = 1 - Math.pow(1 - g / (1 - atraso), 3);
          ctx.globalAlpha = (1 - g) * 0.9;
          ctx.beginPath();
          ctx.arc(x, y, S * 0.014 + e * S * 0.15, 0, TAU);
          ctx.stroke();
        });
      }
    }

    /* o nome acende junto com o ponto e some no rastro */
    const forca = 1 - idade / 0.34;
    if (forca > 0 && !parado) nome(p, x, y, Math.min(1, forca * 1.5));
    ctx.globalAlpha = 1;
  }

  function anel(t) {
    const seg = TAU / meta;
    const grosso = S * 0.013;
    const folga = Math.min(seg * 0.2, 0.06) + grosso / RB;
    ctx.lineCap = 'round';
    ctx.lineWidth = grosso;
    for (let k = 0; k < meta; k++) {
      const ini = TOPO + seg * k + folga / 2;
      const fim = ini + seg - folga;
      ctx.strokeStyle = `rgba(${MENTA},.18)`;
      ctx.beginPath();
      ctx.arc(c, c, RB, ini, fim);
      ctx.stroke();
      const f = Math.min(1, Math.max(0, prog - k));
      if (f > 0.01) {
        ctx.strokeStyle = AMBAR;
        ctx.beginPath();
        ctx.arc(c, c, RB, ini, ini + (fim - ini) * f);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';

    /* o aro do visor vira Âmbar quando a meta fecha */
    const batida = prog >= meta - 0.02;
    ctx.strokeStyle = batida ? AMBAR : `rgba(${MENTA},.34)`;
    ctx.lineWidth = Math.max(1, S / 300);
    ctx.beginPath();
    ctx.arc(c, c, R * CUBO, 0, TAU);
    ctx.stroke();

    if (festa) {
      const f = (t - festa) / 2400;
      if (f >= 1) festa = 0;
      else {
        ctx.strokeStyle = AMBAR;
        ctx.lineWidth = Math.max(1.5, S / 170);
        [0, 0.17, 0.34].forEach((atraso) => {
          const g = f - atraso;
          if (g <= 0) return;
          const e = 1 - Math.pow(1 - g / (1 - atraso), 3);
          ctx.globalAlpha = (1 - g / (1 - atraso)) * 0.8;
          ctx.beginPath();
          ctx.arc(c, c, R * (CUBO + e * (1 - CUBO)), 0, TAU);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      }
    }
  }

  function desenha(t) {
    if (!S) return;
    const dt = Math.min(t - antes, 100);
    antes = t;
    const alvo = Math.min(pontos.length, meta);
    prog = parado ? alvo : prog + (alvo - prog) * (1 - Math.exp(-dt / 340));
    const th = parado ? TAU * 0.13 : (t / VOLTA % 1) * TAU;

    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(base, 0, 0);
    rastro(th);
    feixe(th);
    pontos.forEach((p) => lead(p, th, t));
    anel(t);
  }

  function laco(t) {
    if (cv.offsetParent !== null) desenha(t);
    requestAnimationFrame(laco);
  }

  new ResizeObserver(ajusta).observe(cv);
  ajusta();
  if (!parado) requestAnimationFrame(laco);

  return {
    dados(lista, m) {
      meta = m;
      pontos = lista.slice()
        .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)))
        .map((l, i) => ({
          id: l.id,
          nome: String(l.nome).trim().split(/\s+/)[0].slice(0, 14),
          cor: COR[l.tipo] || PAPEL,
          a: (i * 2.399963 + 0.7) % TAU,                       // ângulo áureo: os pontos nunca se amontoam
          r: (FAIXA[l.tipo] || FAIXA.Frio) + ((hash(l.id) % 9) - 4) / 100
        }));
      if (parado) desenha(performance.now());
    },
    ping(id) { pings[id] = performance.now(); },
    celebra() { festa = performance.now(); }
  };
};
