/* ─────────────────────────────────────────────────────────────────────────
   Kit das telas de prática do Welcome Path (window.Kit).

   Cada página de etapa (public/welcome-path/etapaN-*.html) declara as suas
   atividades e chama Kit.iniciar(ATIVIDADES). O bloco `embed` aponta para a
   página com ?parte=<id> para mostrar UMA atividade no meio do texto da
   etapa; sem ?parte, a página mostra todas (útil para revisar o conteúdo).

   Uma atividade é um objeto:
     tag, titulo, instrucao      → cabeçalho
     estado()                    → estado inicial (o Kit acrescenta r e c)
     corpo(s)                    → HTML do miolo
     perguntas {id: {pergunta, opcoes:[{t, ok, porque}]}}
     grupos {id: {rotulos:[{v, r, tom}], itens:[{t, certo, porque}]}}
     completa(s), progresso(s), fecho
     acoes {nome(dataset, s, el)} → cliques em [data-act="nome"]
     entrada {nome(el, s)}         → digitação em [data-inp="nome"] (sem redesenhar)
     mudanca {nome(el, s)}         → change em [data-chg="nome"]

   Prática não conta nota (decisão da coordenação, 2026-09-24): nada é
   gravado nem enviado. O gabarito fica aqui de propósito.

   Conversa com o portal (a origem é opaca por causa do sandbox):
     recebe {tipo:"ktm-tema", tema}   envia {tipo:"ktm-embed-altura", altura}
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var IC = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    msg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'
  };
  function ic(n, s) {
    s = s || 16;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || "") + "</svg>";
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
  function ini(n) { var p = n.split(" "); return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
  var GENERICAS = ["aula realizada", "aula dada", "aula normal", "aula ok", "ok", "sem novidades", "tudo certo", "tudo certo sem novidades", "presente", "presenca", "faltou", "falta", "aluno participou bem", "aluna participou bem", "participou bem", "boa aula", "aula boa", "teste", "aula"];
  /** Mesma régua do simulador: vazia, genérica ou curta demais. */
  function obsFraca(t) {
    var n = norm(t);
    if (!n || GENERICAS.indexOf(n) >= 0) return true;
    return n.length < 28 || n.split(" ").length < 5;
  }

  /* ═════════ integração com o portal ═════════ */
  var ultimaAltura = 0;
  function avisaAltura() {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (h === ultimaAltura) return;
    ultimaAltura = h;
    try { parent.postMessage({ tipo: "ktm-embed-altura", altura: h }, "*"); } catch (_) {}
  }
  function aplicaTema(t) {
    if (t !== "dark" && t !== "light") return;
    document.documentElement.dataset.theme = t;
    avisaAltura();
  }
  var params = new URLSearchParams(location.search);
  aplicaTema(params.get("tema") || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  window.addEventListener("message", function (e) { var d = e.data; if (d && d.tipo === "ktm-tema") aplicaTema(d.tema); });
  if (window.ResizeObserver) new ResizeObserver(avisaAltura).observe(document.documentElement);
  window.addEventListener("load", avisaAltura);

  /* ═════════ peças de HTML ═════════ */
  function fb(tipo, titulo, texto) {
    var i = tipo === "err" ? "alert" : tipo === "ok" ? "check" : "info";
    return '<div class="fb fb-' + tipo + '" role="' + (tipo === "err" ? "alert" : "status") + '">' + ic(i, 15) + "<div>" + (titulo ? "<b>" + esc(titulo) + "</b>" : "") + esc(texto) + "</div></div>";
  }
  function kmsBar(rota) { return '<div class="kms-bar">King of Languages' + (rota ? '<span class="rota">' + esc(rota) + "</span>" : "") + '<span class="av">VC</span></div>'; }
  function dots5(tipos) {
    return '<span class="dots5">' + tipos.map(function (t) {
      var nome = t === "p" ? "Presença" : t === "r" ? "Reposição" : "Falta";
      return '<span class="d5 d5-' + t + '" title="' + nome + '" aria-label="' + nome + '"></span>';
    }).join("") + "</span>";
  }

  /* Pergunta de escolha única: errar marca a alternativa e explica; acertar trava. */
  function htmlPergunta(def, id, s) {
    var q = def.perguntas[id], r = s.r[id] || { erros: [], certa: null };
    var h = '<div class="pergunta">' + (q.pergunta ? '<div class="lbl">' + esc(q.pergunta) + "</div>" : "") + '<div class="opcoes">';
    q.opcoes.forEach(function (o, i) {
      var cls = r.certa === i ? "certa" : r.erros.indexOf(i) >= 0 ? "errada" : "";
      var trava = r.certa !== null || r.erros.indexOf(i) >= 0;
      h += '<button class="opcao ' + cls + '" id="q-' + id + "-" + i + '" data-act="__esc" data-q="' + id + '" data-i="' + i + '"' + (trava ? " disabled" : "") + '><span class="mk">' + (cls === "certa" ? ic("check", 11) : cls === "errada" ? ic("x", 11) : "") + "</span><span>" + esc(o.t) + "</span></button>";
    });
    h += "</div>";
    var ult = r.ultimo;
    if (ult !== undefined && ult !== null) {
      var o = q.opcoes[ult];
      h += o.ok ? fb("ok", "Isso.", o.porque || "") : fb("err", "Ainda não.", o.porque || "");
    }
    return h + "</div>";
  }
  function perguntaOk(s, id) { return !!(s.r[id] && s.r[id].certa !== null && s.r[id].certa !== undefined); }

  /* Classificar itens: cada item tem uma resposta certa entre os rótulos do grupo. */
  function htmlGrupo(def, id, s) {
    var g = def.grupos[id], c = s.c[id] || {};
    return '<div class="itens">' + g.itens.map(function (it, i) {
      var v = c[i], ok = v !== undefined ? v === it.certo : null;
      return '<div class="item' + (ok === true ? " ok" : ok === false ? " no" : "") + '"><div class="item-txt">' + (it.html || esc(it.t)) + '</div><div class="seg" role="group">' +
        g.rotulos.map(function (r) {
          return '<button id="g-' + id + "-" + i + "-" + r.v + '" class="' + (v === r.v ? (ok ? "v-ok" : "v-no") : "") + '" aria-pressed="' + (v === r.v) + '" data-act="__cls" data-g="' + id + '" data-i="' + i + '" data-v="' + r.v + '">' + esc(r.r) + "</button>";
        }).join("") + "</div>" +
        (ok === null ? "" : '<div class="porque">' + (ok ? ic("check", 13) + " " : ic("x", 13) + " ") + esc(ok ? it.porque : (it.dica || it.porque)) + "</div>") + "</div>";
    }).join("") + "</div>";
  }
  function grupoCertos(def, s, id) {
    var g = def.grupos[id], c = s.c[id] || {}, n = 0;
    g.itens.forEach(function (it, i) { if (c[i] === it.certo) n++; });
    return n;
  }
  function grupoOk(def, s, id) { return grupoCertos(def, s, id) === def.grupos[id].itens.length; }

  /* ═════════ montagem ═════════ */
  function montar(root, def) {
    function novo() { var e = def.estado ? def.estado() : {}; e.r = {}; e.c = {}; return e; }
    var s = novo();
    var api = {
      q: function (id) { return htmlPergunta(def, id, s); },
      g: function (id) { return htmlGrupo(def, id, s); },
      qOk: function (id) { return perguntaOk(s, id); },
      gOk: function (id) { return grupoOk(def, s, id); },
      gCertos: function (id) { return grupoCertos(def, s, id); }
    };
    def.api = api;

    function draw() {
      var a = document.activeElement, foco = a && a.id && root.contains(a) ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
      var feita = def.completa ? def.completa(s, api) : false;
      var prog = def.progresso ? def.progresso(s, api) : null;
      root.className = "atv" + (feita ? " feita" : "");
      root.innerHTML = '<div class="atv-h"><div><span class="tag">' + ic("spark", 12) + esc(def.tag || "Pratique") + "</span><h2>" + esc(def.titulo) + "</h2>" + (def.instrucao ? "<p>" + esc(def.instrucao) + "</p>" : "") + "</div>" +
        (prog ? '<span class="prog' + (feita ? " ok" : "") + '">' + esc(prog) + "</span>" : "") + "</div>" +
        def.corpo(s, api) +
        (feita && def.fecho ? '<div class="fecho" role="status">' + ic("check", 16) + "<span>" + esc(def.fecho) + '</span><button class="link" data-act="__refazer">Refazer</button></div>' : "");
      if (foco) {
        var el = document.getElementById(foco.id);
        if (el) { el.focus({ preventScroll: true }); try { if (foco.s != null) el.setSelectionRange(foco.s, foco.e); } catch (_) {} }
      }
      avisaAltura();
    }

    root.addEventListener("click", function (e) {
      var el = e.target.closest("[data-act]");
      if (!el || el.disabled || !root.contains(el)) return;
      var act = el.dataset.act, d = el.dataset;
      if (act === "__esc") {
        var q = def.perguntas[d.q], i = +d.i, r = s.r[d.q] || (s.r[d.q] = { erros: [], certa: null });
        r.ultimo = i;
        if (q.opcoes[i].ok) r.certa = i; else if (r.erros.indexOf(i) < 0) r.erros.push(i);
      } else if (act === "__cls") {
        (s.c[d.g] || (s.c[d.g] = {}))[+d.i] = d.v;
      } else if (act === "__refazer") {
        s = novo();
      } else if (def.acoes && def.acoes[act]) {
        def.acoes[act](d, s, el);
      } else return;
      draw();
    });
    root.addEventListener("input", function (e) {
      var el = e.target, n = el.dataset && el.dataset.inp;
      if (n && def.entrada && def.entrada[n]) def.entrada[n](el, s);
    });
    root.addEventListener("change", function (e) {
      var el = e.target, n = el.dataset && el.dataset.chg;
      if (n && def.mudanca && def.mudanca[n]) { def.mudanca[n](el, s); draw(); }
    });
    draw();
  }

  function iniciar(atividades) {
    var app = document.getElementById("app");
    var parte = params.get("parte");
    var ids = parte && atividades[parte] ? [parte] : Object.keys(atividades);
    ids.forEach(function (id) {
      var el = document.createElement("section");
      el.setAttribute("aria-label", atividades[id].titulo);
      app.appendChild(el);
      montar(el, atividades[id]);
    });
    avisaAltura();
  }

  window.Kit = { ic: ic, esc: esc, norm: norm, ini: ini, obsFraca: obsFraca, fb: fb, kmsBar: kmsBar, dots5: dots5, iniciar: iniciar };
})();
