'use strict';
(function () {
  var NOMES_ABA = {visao: 'visao-geral', deputados: 'deputados', proposicoes: 'proposicoes',
    emendas: 'emendas', presenca: 'presenca', calendario: 'calendario', votacoes: 'votacoes',
    fontes: 'fontes'};
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  var POR_PAGINA = 50;
  /* OS-141 — a nota que acompanha o dinheiro dos atos 7, 8 e 9. Diz as duas coisas que o
     leitor não tem como adivinhar da tabela: que os reais na tela estão truncados e o CSV
     traz centavos, e que o gabinete é o LÍQUIDO porque o bruto não existe na fonte —
     `folha_pagamento.bruto` está vazio em 229.662 das 229.662 linhas GABINETE (OS-139). */
  var NOTA_DO_DINHEIRO = '<p class="nota">Dinheiro em reais inteiros, truncado para exibição;' +
    ' o CSV desta visão exporta centavos inteiros. <b>Gabinete</b> conta gabinete-meses e' +
    ' soma o <b>líquido</b> da folha: a fonte publica a folha do gabinete sem o bruto' +
    ' (vazio em 229.662 das 229.662 linhas), então o bruto não existe para publicar.</p>';
  var E = {aba: 'visao', ano: null, busca: '', partido: '', chips: {}, pagina: 0,
    comparar: [], sub: 'plenario', exportavel: null, detalhe: null, paginaModal: 0};
  var D = {meta: null, deputados: null, calendario: null, fontes: null, porAno: {}, atos: {}};
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- utilitários ---------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
    });
  }
  function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function inteiro(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function reais(centavos) {
    if (centavos === null || centavos === undefined) { return 'n/d'; }
    var neg = centavos < 0, c = Math.abs(centavos);
    var r = Math.floor(c / 100), resto = String(c % 100).padStart(2, '0');
    return (neg ? '−' : '') + 'R$ ' + r.toLocaleString('pt-BR') + ',' + resto;
  }
  /* OS-141 — o dinheiro dos atos 7, 8 e 9 pintado em REAIS INTEIROS, escolha do operador
     ("Counts and totals, gabinete flagged. Truncate centavos"). TRUNCA, nunca arredonda:
     R$ 3.372.622,29 sai R$ 3.372.622, e o que se perde é sempre menos de um real. É um ato
     de EXIBIÇÃO e só daqui para a frente — o feed carrega centavos inteiros, o CSV exporta
     centavos inteiros e o 41c ressoma os centavos pela espinha. Um número truncado no feed
     divergiria dela. */
  function reaisInteiros(centavos) {
    if (centavos === null || centavos === undefined) { return 'n/d'; }
    var neg = centavos < 0, r = Math.floor(Math.abs(centavos) / 100);
    return (neg ? '\u2212' : '') + 'R$ ' + r.toLocaleString('pt-BR');
  }
  /* A única divisão desta página. Numerador e denominador ficam no mesmo elemento. */
  function razao(n, d) {
    var p = d > 0 ? ((100 * n) / d).toFixed(1).replace('.', ',') + '%' : '—';
    return '<span class="razao"><b>' + inteiro(n) + '</b> de <b>' + inteiro(d) +
      '</b> <i>(' + p + ')</i></span>';
  }
  function barra(n, d) {
    var w = d > 0 ? Math.max(0, Math.min(100, (100 * n) / d)) : 0;
    return '<div class="barra" aria-hidden="true"><span style="width:' + w.toFixed(1) +
      '%"></span></div>';
  }
  function soma(obj) {
    var t = 0; Object.keys(obj || {}).forEach(function (k) { t += obj[k]; }); return t;
  }
  function somaEm(alvo, fonte) {
    Object.keys(fonte || {}).forEach(function (k) { alvo[k] = (alvo[k] || 0) + fonte[k]; });
    return alvo;
  }
  function iniciais(nome) {
    var p = nome.split(/\s+/).filter(function (x) { return x.length > 2; });
    return ((p[0] || nome)[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function anos() { return E.ano === 'todos' ? D.meta.anos_disponiveis : [Number(E.ano)]; }
  function dataBr(iso) {
    if (!iso) { return 's/ data'; }
    var p = iso.slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0];
  }
  function ler(caminho) {
    return fetch(caminho).then(function (r) {
      if (!r.ok) { throw new Error(caminho + ': HTTP ' + r.status); }
      return r.json();
    });
  }
  function carregarAno(tipo) {
    return Promise.all(anos().map(function (a) {
      var k = tipo + '-' + a;
      if (D.porAno[k]) { return D.porAno[k]; }
      return ler('dados/' + k + '.json').then(function (j) { D.porAno[k] = j; return j; });
    }));
  }

  /* ---------- números de um deputado no recorte de anos ---------- */
  function numeros(dep) {
    var t = {atos: {}, apresentou_por_sigla: {}, votos_plenario: {}, votos_comissao: {},
      presencas: {}, sem_presenca: {}, sessoes: {}, materias: 0, comissoes: [],
      emendas: {n: 0, valor_centavos: 0, lei_centavos: 0, empenhado_centavos: 0,
        bloqueado_centavos: 0, disponivel_centavos: 0},
      dinheiro: {verba_centavos: 0, diaria_centavos: 0, gabinete_liquido_centavos: 0}};
    anos().forEach(function (a) {
      var c = dep.anos[String(a)], m = D.meta.anos[String(a)];
      ['atos', 'apresentou_por_sigla', 'votos_plenario', 'votos_comissao', 'presencas',
        'sem_presenca'].forEach(function (k) { somaEm(t[k], c[k]); });
      somaEm(t.emendas, c.emendas);
      somaEm(t.dinheiro, c.dinheiro);
      somaEm(t.sessoes, m.sessoes);
      t.materias += m.materias_plenario;
      c.comissoes.forEach(function (x) { t.comissoes.push([a, x[0], x[1]]); });
    });
    return t;
  }
  function metaSoma(campo) {
    var t = 0; anos().forEach(function (a) { t += D.meta.anos[String(a)][campo]; }); return t;
  }
  function metaMapa(campo) {
    var t = {}; anos().forEach(function (a) { somaEm(t, D.meta.anos[String(a)][campo]); });
    return t;
  }
  function depsFiltrados() {
    var q = semAcento(E.busca);
    return D.deputados.filter(function (d) {
      if (E.partido && d.partido !== E.partido) { return false; }
      return !q || semAcento(d.nome + ' ' + (d.partido || '')).indexOf(q) >= 0;
    });
  }

  /* ---------- filtros, chips, paginação ---------- */
  function chips(grupo, itens) {
    var ativo = E.chips[grupo] || '';
    $('chips').innerHTML = itens.map(function (it) {
      return '<button type="button" class="chip" data-grupo="' + esc(grupo) + '" data-valor="' +
        esc(it[0]) + '" aria-pressed="' + (ativo === it[0]) + '">' + esc(it[1]) +
        (it[2] === undefined ? '' : '<small>' + inteiro(it[2]) + '</small>') + '</button>';
    }).join('');
  }
  function contar(linhas, chave) {
    var m = {}; linhas.forEach(function (l) { var k = chave(l); m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a] || a.localeCompare(b); })
      .map(function (k) { return [k, k, m[k]]; });
  }
  function paginar(linhas, desenhar) {
    var total = linhas.length, paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (E.pagina >= paginas) { E.pagina = 0; }
    var ini = E.pagina * POR_PAGINA, corte = linhas.slice(ini, ini + POR_PAGINA);
    return desenhar(corte) + '<div class="pag"><button type="button" data-pag="-1"' +
      (E.pagina === 0 ? ' disabled' : '') + '>← anterior</button><span>' + inteiro(ini + 1) +
      '–' + inteiro(ini + corte.length) + ' de ' + inteiro(total) + '</span>' +
      '<button type="button" data-pag="1"' + (E.pagina >= paginas - 1 ? ' disabled' : '') +
      '>próxima →</button></div>';
  }
  // val e sub chegam como MARCAÇÃO já montada por inteiro(), reais(), razao(), barra() e esc():
  // quem chama escapa todo texto do ledger antes de passá-lo para cá.
  function kpi(rot, val, sub, acao) {
    return '<div class="kpi"><div class="rot">' + esc(rot) + '</div><div class="val">' + val +
      '</div><div class="sub">' + (sub || '') + '</div>' + (acao || '') + '</div>';
  }
  function nomesDe(indices) {
    return indices.map(function (i) { return D.deputados[i].nome; }).join(', ');
  }
  function passaPartido(indices) {
    if (!E.partido) { return true; }
    return indices.some(function (i) { return D.deputados[i].partido === E.partido; });
  }

  /* ---------- modal ---------- */
  var focoAnterior = null;
  function abrirModal(html) {
    E.detalhe = null; E.paginaModal = 0;
    focoAnterior = document.activeElement;
    $('modal-corpo').innerHTML = html; $('modal').hidden = false; $('modal-fechar').focus();
  }
  function fecharModal() {
    $('modal').hidden = true; $('modal-corpo').innerHTML = ''; E.detalhe = null;
    if (focoAnterior && focoAnterior.focus) { focoAnterior.focus(); }
  }

  /* ---------- Detalhes: as linhas de ato por trás de cada número (OS-144) ----------
     O botão é a afordância e o número continua sem ser clicável, como o operador pediu:
     "First. But a button details. Not the number". Cada estilhaço
     `dados/atos/<tipo>-<ano>.json` só é baixado quando um botão o pede, e fica em cache
     enquanto a visita durar — `deputados.json`, que toda visita baixa, não cresce um byte.
     As ligações NÃO são montadas aqui: cada bloco traz a sua plantilha do estilhaço, e um
     bloco sem plantilha utilizável e sem artefato publicado diz "sem link público". */
  function botaoDetalhe(tipos, rotulo, dep, fonte) {
    return '<button type="button" class="detalhe" data-detalhe="' + esc(tipos.join(',')) +
      '" data-rot="' + esc(rotulo) + '"' +
      (dep === undefined || dep === null ? '' : ' data-dep="' + Number(dep) + '"') +
      (fonte ? ' data-fonte="' + esc(fonte) + '"' : '') + '>Detalhes</button>';
  }
  /* Quatro números da visão geral são POPULAÇÕES, não atos dos titulares: proposições,
     sessões plenárias, matérias votadas e folhas de votação. As linhas por trás deles já
     estão publicadas — nas abas que as listam — e o botão leva o leitor até lá em vez de
     inventar um recorte que não é o do número. */
  function botaoIr(aba, rotulo, sub) {
    return '<button type="button" class="detalhe" data-ir="' + esc(aba) + '"' +
      (sub ? ' data-ir-sub="' + esc(sub) + '"' : '') + '>' + esc(rotulo) + '</button>';
  }
  function carregarAtos(tipo) {
    return Promise.all(anos().map(function (a) {
      var k = tipo + '-' + a;
      if (D.atos[k]) { return D.atos[k]; }
      return ler('dados/atos/' + k + '.json').then(function (j) { D.atos[k] = j; return j; });
    }));
  }
  function juntarBlocos(estilhacos) {
    var ordem = [], por = {};
    estilhacos.forEach(function (j) {
      j.blocos.forEach(function (b) {
        var k = j.tipo_ato + '|' + b.fonte;
        if (!por[k]) {
          por[k] = {tipo_ato: j.tipo_ato, fonte: b.fonte, nome: b.nome, colunas: b.colunas,
            ligacao: b.ligacao, publicado: b.publicado, linhas: []};
          ordem.push(k);
        }
        por[k].linhas = por[k].linhas.concat(b.linhas);
      });
    });
    return ordem.map(function (k) { return por[k]; });
  }
  function filtrarDetalhe(blocos, s) {
    var quem = {};
    if (s.dep === null) { depsFiltrados().forEach(function (d) { quem[d.i] = 1; }); }
    else { quem[s.dep] = 1; }
    return blocos.filter(function (b) { return !s.fonte || b.fonte === s.fonte; })
      .map(function (b) {
        return {tipo_ato: b.tipo_ato, fonte: b.fonte, nome: b.nome, colunas: b.colunas,
          ligacao: b.ligacao, publicado: b.publicado,
          linhas: b.linhas.filter(function (l) { return quem[l[0]] === 1; })};
      });
  }
  function ligar(b, l) {
    if (b.ligacao) {
      var v = b.ligacao.campos.map(function (c) { return l[c]; });
      if (v.every(function (x) { return x !== null && x !== undefined && x !== ''; })) {
        var u = b.ligacao.plantilla;
        v.forEach(function (x, k) { u = u.split('{' + k + '}').join(encodeURIComponent(x)); });
        return '<a rel="noopener noreferrer" target="_blank" href="' + esc(u) + '">' +
          esc(b.ligacao.rotulo) + '</a>';
      }
    }
    if (b.publicado) {
      return '<a rel="noopener noreferrer" target="_blank" href="' + esc(b.publicado.url) +
        '">' + esc(b.publicado.rotulo) + '</a>';
    }
    return '<span class="sem-link">sem link público</span>';
  }
  var ROTULO_DE_COLUNA = {valor_centavos: 'valor', lei_centavos: 'em lei',
    empenhado_centavos: 'empenhado'};
  function ehDinheiro(c) { return c.slice(-9) === '_centavos'; }
  function secaoDetalhe(b, corte) {
    var soma = {}, temSoma = [];
    b.colunas.forEach(function (c, i) {
      if (!ehDinheiro(c)) { return; }
      soma[i] = 0; temSoma.push(i);
      b.linhas.forEach(function (l) { soma[i] += l[i] || 0; });
    });
    var h = '<h2>' + esc(b.nome) + ' — ' + inteiro(b.linhas.length) + '</h2>';
    if (b.publicado) {
      h += '<p class="nota">Arquivo ou painel publicado: <a rel="noopener noreferrer" ' +
        'target="_blank" href="' + esc(b.publicado.url) + '">' + esc(b.publicado.rotulo) +
        '</a> · consulta gravada em <code>' + esc(b.publicado.consulta) + '</code></p>';
    }
    h += '<div class="rolagem"><table><thead><tr>' + b.colunas.map(function (c, i) {
      return '<th' + (ehDinheiro(c) ? ' class="num"' : '') + '>' +
        esc(ROTULO_DE_COLUNA[c] || c) + '</th>'; }).join('') +
      '<th>ligação</th></tr></thead><tbody>' + corte.map(function (l) {
        return '<tr>' + b.colunas.map(function (c, i) {
          var v = l[i];
          if (i === 0) { return '<td>' + esc(D.deputados[v].nome) + '</td>'; }
          if (i === 1) { return '<td>' + esc(dataBr(v)) + '</td>'; }
          if (ehDinheiro(c)) { return '<td class="num">' + reais(v) + '</td>'; }
          if (v === null || v === undefined || v === '') {
            return '<td class="sem-link">n/d</td>';
          }
          return '<td' + (typeof v === 'number' ? ' class="num"' : '') + '>' + esc(v) + '</td>';
        }).join('') + '<td>' + ligar(b, l) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    if (temSoma.length) {
      h += '<p class="nota">Soma destas ' + inteiro(b.linhas.length) + ' linhas: ' +
        temSoma.map(function (i) {
          return esc(ROTULO_DE_COLUNA[b.colunas[i]] || b.colunas[i]) + ' ' +
            reaisInteiros(soma[i]);
        }).join(' · ') + '. Truncada para exibição como em toda a página; as linhas acima ' +
        'trazem os centavos.</p>';
    }
    return h;
  }
  /* Uma paginação só, atravessando os blocos: o tipo 4 tem dois (plenário e comissão) e o
     tipo 6 tem dois (painel e créditos adicionais), e dois paginadores na mesma janela
     seriam dois recortes que o leitor teria de casar de cabeça. */
  function htmlDetalhe(s, estilhacos) {
    var blocos = filtrarDetalhe(juntarBlocos(estilhacos), s);
    var total = 0; blocos.forEach(function (b) { total += b.linhas.length; });
    var paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (E.paginaModal >= paginas) { E.paginaModal = 0; }
    var ini = E.paginaModal * POR_PAGINA, fim = ini + POR_PAGINA, visto = 0;
    var h = '<h3 id="modal-titulo">' + esc(s.rotulo) + '</h3><p class="nota">' + inteiro(total) +
      (total === 1 ? ' ato' : ' atos') + ' · ' + esc(rotuloAno()) + ' · ' +
      (s.dep === null ? inteiro(depsFiltrados().length) + ' de ' +
        inteiro(D.deputados.length) + ' titulares' : esc(D.deputados[s.dep].nome)) +
      '. Cada linha liga ao artefato público mais fino que a fonte expõe.' +
      (s.dep === null ? '' : '<button type="button" class="detalhe" data-perfil="' +
        Number(s.dep) + '">← voltar ao perfil</button>') + '</p>';
    if (!total) { return h + '<p class="aviso">Nenhum ato neste recorte.</p>'; }
    var geral = {}, ordemGeral = [];
    blocos.forEach(function (b) {
      b.colunas.forEach(function (c, i) {
        if (!ehDinheiro(c)) { return; }
        if (geral[c] === undefined) { geral[c] = 0; ordemGeral.push(c); }
        b.linhas.forEach(function (l) { geral[c] += l[i] || 0; });
      });
    });
    if (ordemGeral.length && blocos.length > 1) {
      h += '<p class="nota">Somando os ' + inteiro(blocos.length) + ' blocos: ' +
        ordemGeral.map(function (c) {
          return esc(ROTULO_DE_COLUNA[c] || c) + ' ' + reaisInteiros(geral[c]);
        }).join(' · ') + '. É este o total que o número de onde este botão saiu mostra.</p>';
    }
    blocos.forEach(function (b) {
      var a = Math.max(0, ini - visto), z = Math.min(b.linhas.length, fim - visto);
      visto += b.linhas.length;
      if (z > a) { h += secaoDetalhe(b, b.linhas.slice(a, z)); }
    });
    return h + '<div class="pag"><button type="button" data-pagm="-1"' +
      (E.paginaModal === 0 ? ' disabled' : '') + '>← anterior</button><span>' +
      inteiro(ini + 1) + '–' + inteiro(Math.min(fim, total)) + ' de ' + inteiro(total) +
      '</span><button type="button" data-pagm="1"' +
      (E.paginaModal >= paginas - 1 ? ' disabled' : '') + '>próxima →</button></div>';
  }
  function abrirDetalhe(s) {
    abrirModal('<p class="aviso">Carregando as linhas deste número…</p>');
    E.detalhe = s; E.paginaModal = 0;
    desenharDetalhe();
  }
  function desenharDetalhe() {
    var s = E.detalhe;
    if (!s) { return; }
    Promise.all(s.tipos.map(carregarAtos)).then(function (grupos) {
      if (E.detalhe !== s) { return; }
      $('modal-corpo').innerHTML = htmlDetalhe(s, [].concat.apply([], grupos));
    }).catch(function (e) {
      $('modal-corpo').innerHTML = '<p class="aviso">Não foi possível ler o detalhe: ' +
        esc(e.message) + '</p>';
    });
  }
  function tiposDoLedger() {
    return D.meta.tipos_ato.map(function (t) { return t.tipo_ato; });
  }

  /* ---------- Visão geral ---------- */
  function visao() {
    chips('', []);
    var deps = depsFiltrados(), tit = metaMapa('atos_dos_titulares'), led = metaMapa('atos_no_ledger');
    var sess = metaMapa('sessoes'), pres = 0, poss = 0, em = {n: 0, valor_centavos: 0,
      empenhado_centavos: 0, lei_centavos: 0};
    var linhas = deps.map(function (d) {
      var n = numeros(d);
      pres += soma(n.presencas); poss += soma(n.presencas) + soma(n.sem_presenca);
      somaEm(em, n.emendas);
      return [d, n];
    });
    var h = '<div class="kpis">' +
      kpi('Atos dos titulares', inteiro(soma(tit)), razao(soma(tit), soma(led)) + ' dos atos do ledger no período',
        botaoDetalhe(tiposDoLedger(), 'Atos dos titulares')) +
      kpi('Proposições', inteiro(metaSoma('proposicoes')), 'com ao menos um titular entre os autores',
        botaoIr('proposicoes', 'Ver as proposições')) +
      kpi('Emendas ao orçamento', inteiro(em.n), reais(em.valor_centavos) + ' somados',
        botaoDetalhe([6], 'Emendas ao orçamento')) +
      kpi('Empenhado das emendas', reais(em.empenhado_centavos), 'de ' + reais(em.lei_centavos) + ' em lei (painel de emendas)',
        botaoDetalhe([6], 'Emendas ao orçamento — em lei e empenhado')) +
      kpi('Sessões plenárias', inteiro(soma(sess)), Object.keys(sess).sort().map(function (k) {
        return esc(k.toLowerCase()) + ' ' + inteiro(sess[k]); }).join(' · '),
        botaoIr('presenca', 'Ver as sessões')) +
      kpi('Presenças registradas', razao(pres, poss), 'presenças sobre sessões possíveis' + barra(pres, poss),
        botaoDetalhe([5], 'Presenças registradas')) +
      kpi('Matérias votadas em plenário', inteiro(metaSoma('materias_plenario')), 'votação nominal',
        botaoIr('votacoes', 'Ver as matérias', 'plenario')) +
      kpi('Folhas de votação em comissão', inteiro(metaSoma('folhas_comissao')), 'com ao menos uma marca lida',
        botaoIr('votacoes', 'Ver as folhas', 'comissao')) +
      '</div>';
    h += '<h2>Atos por tipo</h2><div class="rolagem"><table class="tipos"><thead><tr><th>Tipo</th>' +
      '<th>Ato</th><th class="num">Titulares</th><th class="num">Ledger</th><th>Detalhe</th>' +
      '</tr></thead><tbody>';
    D.meta.tipos_ato.forEach(function (t) {
      var k = String(t.tipo_ato), fora = t.atos === 0;
      // O botão abre a coluna TITULARES, que é o recorte desta página; a coluna Ledger
      // conta os atos de qualquer autor e não tem linha publicada aqui.
      h += '<tr' + (fora ? ' class="fora"' : '') + '><td>' + t.tipo_ato + '</td><td>' + esc(t.nome) +
        (fora ? ' — <em>ainda não carregado</em>' : '') + '</td><td class="num">' +
        inteiro(tit[k] || 0) + '</td><td class="num">' + inteiro(led[k] || 0) + '</td><td>' +
        (tit[k] ? botaoDetalhe([t.tipo_ato], t.nome) : '<span class="sem-link">—</span>') +
        '</td></tr>';
    });
    h += '</tbody></table></div><h2>Por deputado</h2>';
    // OS-141 — os quatro tipos que a OS-139 carregou ganham coluna, e os três totais de
    // dinheiro com eles. O gabinete diz no próprio cabeçalho que é o LÍQUIDO.
    var cab = ['Deputado', 'Partido', 'Apresentou', 'Assinou', 'Relatou', 'Votou', 'Presenças',
      'Emendas', 'Emendas (R$)', 'Verba', 'Verba (R$)', 'Diárias', 'Diárias (R$)',
      'Gabinete (meses)', 'Gabinete líquido (R$)', 'Resultados', 'Comissões'];
    var corpo = linhas.map(function (x) {
      var d = x[0], n = x[1], m = n.dinheiro;
      return [d.nome, d.partido || '', n.atos['1'] || 0, n.atos['2'] || 0, n.atos['3'] || 0,
        n.atos['4'] || 0, n.atos['5'] || 0, n.emendas.n, n.emendas.valor_centavos,
        n.atos['7'] || 0, m.verba_centavos, n.atos['8'] || 0, m.diaria_centavos,
        n.atos['9'] || 0, m.gabinete_liquido_centavos, n.atos['11'] || 0, n.atos['10'] || 0];
    });
    h += tabela(cab, corpo, [8], [10, 12, 14]) + NOTA_DO_DINHEIRO;
    // O CSV carrega CENTAVOS INTEIROS e o cabeçalho diz a unidade de cada célula de
    // dinheiro: é o artefato conferível, e o truncamento acima é da tela, não do dado.
    var emCentavos = {8: 'emendas_centavos', 10: 'verba_centavos', 12: 'diaria_centavos',
      14: 'gabinete_liquido_centavos'};
    E.exportavel = {nome: 'visao-geral', linhas: corpo,
      colunas: cab.map(function (c, i) { return emCentavos[i] || c; })};
    return h;
  }
  function tabela(cab, corpo, colunasDeDinheiro, colunasTruncadas) {
    var din = colunasDeDinheiro || [], trunc = colunasTruncadas || [];
    return '<div class="rolagem"><table><thead><tr>' + cab.map(function (c, i) {
      return '<th' + (i > 1 ? ' class="num"' : '') + '>' + esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + corpo.map(function (l) {
        return '<tr>' + l.map(function (v, i) {
          var num = typeof v === 'number';
          var pinta = trunc.indexOf(i) >= 0 ? reaisInteiros
            : (din.indexOf(i) >= 0 ? reais : inteiro);
          return '<td' + (num ? ' class="num"' : '') + '>' +
            (num ? pinta(v) : esc(v)) + '</td>';
        }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }

  /* ---------- Deputados ---------- */
  function deputados() {
    chips('', []);
    var deps = depsFiltrados();
    var h = '<p class="nota">' + inteiro(deps.length) + ' de ' + inteiro(D.deputados.length) +
      ' titulares. Marque dois para comparar.</p><div class="grade">';
    var corpo = [];
    deps.forEach(function (d) {
      var n = numeros(d), p = soma(n.presencas), poss = p + soma(n.sem_presenca);
      var vp = soma(n.votos_plenario);
      corpo.push([d.nome, d.partido || '', n.atos['1'] || 0, p, poss, vp, n.materias,
        n.emendas.n, n.emendas.valor_centavos]);
      h += '<article class="cartao-dep"><header><span class="avatar" aria-hidden="true">' +
        esc(iniciais(d.nome)) + '</span><div><h3>' + esc(d.nome) + '</h3><span class="partido">' +
        esc(d.partido || 's/ partido no registro') + '</span></div></header><dl class="mini">' +
        '<div><dt>Proposições</dt><dd>' + inteiro(n.atos['1'] || 0) +
        botaoDetalhe([1], 'Proposições — ' + d.nome, d.i) + '</dd></div>' +
        '<div><dt>Presença</dt><dd>' + razao(p, poss) +
        botaoDetalhe([5], 'Presenças — ' + d.nome, d.i) + '</dd></div>' +
        '<div><dt>Votos em plenário</dt><dd>' + razao(vp, n.materias) +
        botaoDetalhe([4], 'Votos em plenário — ' + d.nome, d.i, 'painel_votacao') + '</dd></div>' +
        '<div><dt>Emendas</dt><dd>' + inteiro(n.emendas.n) + ' · ' + reais(n.emendas.valor_centavos) +
        botaoDetalhe([6], 'Emendas — ' + d.nome, d.i) + '</dd></div></dl><footer><button type="button" data-perfil="' + d.i + '">Ver perfil</button>' +
        '<label><input type="checkbox" data-comparar="' + d.i + '"' +
        (E.comparar.indexOf(d.i) >= 0 ? ' checked' : '') + '> comparar</label></footer></article>';
    });
    h += '</div>';
    if (E.comparar.length) {
      h += '<div class="comparar-barra"><span>' + esc(nomesDe(E.comparar)) + '</span>' +
        '<button type="button" id="abrir-comparar"' + (E.comparar.length === 2 ? '' : ' disabled') +
        '>Comparar</button></div>';
    }
    E.exportavel = {nome: 'deputados', colunas: ['deputado', 'partido', 'proposicoes', 'presencas',
      'sessoes_possiveis', 'votos_plenario', 'materias_votadas', 'emendas', 'emendas_centavos'],
      linhas: corpo};
    return h;
  }
  function blocoPerfil(d) {
    var n = numeros(d), p = soma(n.presencas), poss = p + soma(n.sem_presenca);
    var h = '<h3>' + esc(d.nome) + ' <span class="partido">' + esc(d.partido || 's/ partido') +
      '</span></h3><div class="kpis">' +
      kpi('Apresentou', inteiro(n.atos['1'] || 0), Object.keys(n.apresentou_por_sigla).sort().map(function (s) {
        return esc(s) + ' ' + inteiro(n.apresentou_por_sigla[s]); }).join(' · '),
        botaoDetalhe([1], 'Proposições apresentadas — ' + d.nome, d.i)) +
      kpi('Assinou documentos', inteiro(n.atos['2'] || 0), 'ato 2 do ledger',
        botaoDetalhe([2], 'Documentos assinados — ' + d.nome, d.i)) +
      kpi('Relatou (parecer)', inteiro(n.atos['3'] || 0), 'onde o relator é atribuível',
        botaoDetalhe([3], 'Pareceres relatados — ' + d.nome, d.i)) +
      kpi('Presença', razao(p, poss), barra(p, poss),
        botaoDetalhe([5], 'Presenças — ' + d.nome, d.i)) + '</div>';
    h += '<h2>Presença por tipo de sessão' +
      botaoDetalhe([5], 'Presenças — ' + d.nome, d.i) + '</h2><ul>';
    Object.keys(n.sessoes).sort().forEach(function (t) {
      var pr = n.presencas[t] || 0, tot = pr + (n.sem_presenca[t] || 0);
      h += '<li>' + esc(t.toLowerCase()) + ': ' + razao(pr, tot) + '</li>';
    });
    h += '</ul><h2>Votos</h2><ul><li>Plenário (nominal): ' +
      ['SIM', 'NAO', 'ABSTENCAO'].map(function (v) {
        return esc(v) + ' ' + inteiro(n.votos_plenario[v] || 0); }).join(' · ') + ' — ' +
      razao(soma(n.votos_plenario), n.materias) + ' das matérias do período' +
      botaoDetalhe([4], 'Votos em plenário — ' + d.nome, d.i, 'painel_votacao') +
      '</li><li>Comissão (folha de votação): ' +
      ['favoravel', 'contrario', 'abstencao'].map(function (v) {
        return esc(v) + ' ' + inteiro(n.votos_comissao[v] || 0); }).join(' · ') +
      ' · na folha sem marca ' + inteiro(n.votos_comissao.sem_marca || 0) +
      botaoDetalhe([4], 'Marcas em folha de comissão — ' + d.nome, d.i, 'documento_ativas') +
      '</li></ul>';
    // OS-141 — o perfil ganha o dinheiro dos atos 7, 8 e 9, com a mesma nota da tabela.
    h += '<h2>Verba, diárias e gabinete</h2><ul><li>Verba indenizatória: ' +
      inteiro(n.atos['7'] || 0) + ' comprovantes · ' + reaisInteiros(n.dinheiro.verba_centavos) +
      botaoDetalhe([7], 'Verba indenizatória — ' + d.nome, d.i) +
      '</li><li>Diárias: ' + inteiro(n.atos['8'] || 0) + ' · ' +
      reaisInteiros(n.dinheiro.diaria_centavos) +
      botaoDetalhe([8], 'Diárias — ' + d.nome, d.i) + '</li><li>Gabinete: ' +
      inteiro(n.atos['9'] || 0) + ' gabinete-meses · ' +
      reaisInteiros(n.dinheiro.gabinete_liquido_centavos) + ' líquidos' +
      botaoDetalhe([9], 'Custo do gabinete — ' + d.nome, d.i) + '</li><li>Resultado de ' +
      'proposição: ' + inteiro(n.atos['11'] || 0) + ' atos' +
      botaoDetalhe([11], 'Resultados obtidos — ' + d.nome, d.i) + '</li></ul>' + NOTA_DO_DINHEIRO;
    h += '<h2>Emendas ao orçamento' + botaoDetalhe([6], 'Emendas — ' + d.nome, d.i) +
      '</h2><ul><li>' + inteiro(n.emendas.n) + ' emendas · ' +
      reais(n.emendas.valor_centavos) + ' somados</li><li>Painel de emendas: ' +
      reais(n.emendas.empenhado_centavos) + ' empenhados de ' + reais(n.emendas.lei_centavos) +
      ' em lei</li></ul><h2>Comissões (reuniões lidas)' +
      botaoDetalhe([10], 'Composição de comissões — ' + d.nome, d.i) + '</h2>';
    h += n.comissoes.length ? '<ul>' + n.comissoes.map(function (c) {
      return '<li>' + c[0] + ' · ' + esc(c[1]) + ' · ' + esc(c[2]) + '</li>'; }).join('') + '</ul>'
      : '<p class="nota">Nenhuma composição lida no período.</p>';
    return h;
  }
  function perfil(i) {
    abrirModal('<div id="modal-titulo">' + blocoPerfil(D.deputados[i]) + '</div>' +
      '<p class="nota">Período: ' + esc(rotuloAno()) + '.</p>');
  }
  function comparar() {
    abrirModal('<h3 id="modal-titulo">Comparar — ' + esc(rotuloAno()) + '</h3><div class="duas">' +
      E.comparar.map(function (i) { return '<div>' + blocoPerfil(D.deputados[i]) + '</div>'; }).join('') +
      '</div>');
  }
  function rotuloAno() { return E.ano === 'todos' ? '2023–2026' : String(E.ano); }

  /* ---------- Proposições ---------- */
  function proposicoes(feeds) {
    var todas = []; feeds.forEach(function (f) { todas = todas.concat(f.linhas); });
    var q = semAcento(E.busca), sigla = E.chips.sigla || '';
    var base = todas.filter(function (l) {
      if (!passaPartido(l[6])) { return false; }
      return !q || semAcento(l[1] + ' ' + (l[3] || '') + ' ' + nomesDe(l[6])).indexOf(q) >= 0;
    });
    chips('sigla', contar(base, function (l) { return l[2]; }));
    var linhas = sigla ? base.filter(function (l) { return l[2] === sigla; }) : base;
    E.exportavel = {nome: 'proposicoes', colunas: ['proposicao_id', 'sigla_numero_ano', 'ementa',
      'etapa', 'data_leitura', 'autores_titulares', 'n_autores', 'regioes'],
      linhas: linhas.map(function (l) {
        return [l[0], l[1], l[3], l[4], l[5], nomesDe(l[6]), l[7], l[8].join(' ')]; })};
    E.lista = linhas;
    return '<p class="nota">' + inteiro(linhas.length) + ' de ' + inteiro(todas.length) +
      ' proposições. A <b>etapa</b> é a registrada na própria proposição; o resultado final é ' +
      'o ato 11 do ledger, que esta lista não traz por linha.' +
      botaoDetalhe([11], 'Resultados obtidos') + '</p>' + paginar(linhas, function (corte) {
        return '<div class="lista">' + corte.map(function (l) {
          return '<button type="button" class="linha" data-prop="' + l[0] + '"><span class="sigla">' +
            esc(l[2]) + '</span><span class="corpo"><b>' + esc(l[1]) + '</b><p>' +
            esc((l[3] || '').slice(0, 220)) + ((l[3] || '').length > 220 ? '…' : '') + '</p><p>' +
            esc(nomesDe(l[6])) + '</p></span><span class="lado"><b>' + esc(dataBr(l[5])) +
            '</b>' + esc((l[4] || '').split(',')[0]) + '</span></button>'; }).join('') + '</div>';
      });
  }
  function detalheProposicao(id) {
    var l = (E.lista || []).filter(function (x) { return x[0] === id; })[0]; if (!l) { return; }
    abrirModal('<h3 id="modal-titulo"><span class="sigla">' + esc(l[2]) + '</span> ' + esc(l[1]) +
      '</h3><p>' + esc(l[3] || 'sem ementa no registro') + '</p><ul><li>Autores titulares: ' +
      esc(nomesDe(l[6])) + ' — ' + razao(l[6].length, l[7]) + ' dos autores</li><li>Lida em: ' +
      esc(dataBr(l[5])) + '</li><li>Etapa no registro: ' + esc(l[4] || 'n/d') +
      '</li><li>Resultado final: publicado como ato 11 (“obteve resultado”), que esta lista ' +
      'não traz por linha</li><li>Regiões citadas: ' +
      (l[8].length ? esc(l[8].map(function (r) { return D.meta.regioes[r] || r; }).join('; ')) : 'nenhuma') +
      '</li><li>Identificador na API da CLDF: ' + l[0] + '</li></ul>');
  }

  /* ---------- Emendas ---------- */
  function estadoEmenda(l) { return l[6] || l[5] || 'n/d'; }
  function emendas(feeds) {
    var todas = []; feeds.forEach(function (f) { todas = todas.concat(f.linhas); });
    var q = semAcento(E.busca), st = E.chips.estado || '';
    var base = todas.filter(function (l) {
      if (!passaPartido([l[3]])) { return false; }
      return !q || semAcento(l[0] + ' ' + (l[2] || '') + ' ' + D.deputados[l[3]].nome).indexOf(q) >= 0;
    });
    chips('estado', contar(base, estadoEmenda));
    var linhas = st ? base.filter(function (l) { return estadoEmenda(l) === st; }) : base;
    var t = {v: 0, lei: 0, emp: 0};
    linhas.forEach(function (l) { t.v += l[8] || 0; t.lei += l[9] || 0; t.emp += l[10] || 0; });
    E.lista = linhas;
    E.exportavel = {nome: 'emendas', colunas: ['id_emenda', 'nr_emenda', 'lei', 'autor', 'fase',
      'situacao', 'status', 'impositiva', 'valor_centavos', 'lei_centavos', 'empenhado_centavos',
      'bloqueado_centavos', 'disponivel_centavos'],
      linhas: linhas.map(function (l) {
        var c = l.slice(0, 13); c[3] = D.deputados[l[3]].nome; return c; })};
    return '<div class="kpis">' + kpi('Emendas', inteiro(linhas.length), 'de ' + inteiro(todas.length) + ' no período') +
      kpi('Valor somado', reais(t.v), 'valor em lei ou soma dos acréscimos') +
      kpi('Empenhado', reais(t.emp), 'de ' + reais(t.lei) + ' em lei (painel de emendas)') + '</div>' +
      '<p class="nota">Função, subfunção e natureza aparecem como o código publicado; o ledger ' +
      'não guarda rótulo para eles.</p>' +
      paginar(linhas, function (corte) {
        return '<div class="lista">' + corte.map(function (l, k) {
          return '<button type="button" class="linha" data-emenda="' + (E.pagina * POR_PAGINA + k) +
            '"><span class="sigla">' + esc(estadoEmenda(l)) + '</span><span class="corpo"><b>' +
            esc(l[0]) + '</b><p>' + esc(l[2] || '') + '</p><p>' + esc(D.deputados[l[3]].nome) +
            '</p></span><span class="lado"><b>' + reais(l[8]) + '</b>' +
            (l[7] === 1 ? 'impositiva' : '') + '</span></button>'; }).join('') + '</div>';
      });
  }
  function detalheEmenda(k) {
    var l = (E.lista || [])[k]; if (!l) { return; }
    var h = '<h3 id="modal-titulo">Emenda ' + esc(l[0]) + '</h3><ul><li>Autor: ' +
      esc(D.deputados[l[3]].nome) + '</li><li>Lei / projeto: ' + esc(l[2] || 'n/d') +
      '</li><li>Fase · situação · status: ' + esc([l[4], l[5], l[6]].filter(Boolean).join(' · ') || 'n/d') +
      '</li><li>Valor do ato: ' + reais(l[8]) + '</li>';
    if (l[9] !== null) {
      h += '<li>Em lei ' + reais(l[9]) + ' · empenhado ' + reais(l[10]) + ' · bloqueado ' +
        reais(l[11]) + ' · disponível ' + reais(l[12]) + '</li>';
    }
    h += '</ul>';
    if (l[13].length) {
      h += '<h2>Contas</h2>' + tabela(['Movimento', 'UO', 'Função', 'Subfunção', 'Programa', 'Ação',
        'Região', 'Natureza', 'Valor'], l[13].map(function (c) {
        return [c[0] || '', c[1] || '', c[2] || '', c[3] || '', c[4] || '', c[5] || '',
          D.meta.regioes[c[6]] || c[6] || '', c[7] || '', c[8] === null ? '' : reais(c[8])]; }));
    }
    abrirModal(h);
  }

  /* ---------- Presença ---------- */
  function presenca(feeds) {
    var sess = []; feeds.forEach(function (f) { sess = sess.concat(f.linhas); });
    var tipo = E.chips.tipo || '';
    chips('tipo', contar(sess, function (s) { return s[2]; }));
    var deps = depsFiltrados();
    var linhas = tipo ? sess.filter(function (s) { return s[2] === tipo; }) : sess;
    var cab = ['Deputado', 'Partido', 'Presenças', 'Sessões possíveis', 'Sem presença'];
    var corpo = deps.map(function (d) {
      var n = numeros(d), p = 0, f = 0;
      Object.keys(n.sessoes).forEach(function (t) {
        if (tipo && t !== tipo) { return; }
        p += n.presencas[t] || 0; f += n.sem_presenca[t] || 0;
      });
      return [d.nome, d.partido || '', p, p + f, f];
    }).sort(function (a, b) { return b[2] * a[3] - a[2] * b[3] || a[0].localeCompare(b[0]); });
    var h = '<p class="nota">“Sem presença” é a sessão do período em que o painel de presença não ' +
      'registra o deputado — inclui licença, afastamento e missão, que o acervo não distingue.</p>' +
      '<div class="rolagem"><table><thead><tr><th>Deputado</th><th>Partido</th><th>Presença</th>' +
      '<th class="num">Sem presença</th></tr></thead><tbody>' + corpo.map(function (l) {
        return '<tr><td>' + esc(l[0]) + '</td><td>' + esc(l[1]) + '</td><td>' + razao(l[2], l[3]) +
          barra(l[2], l[3]) + '</td><td class="num">' + inteiro(l[4]) + '</td></tr>'; }).join('') +
      '</tbody></table></div><h2>Sessões</h2>';
    E.lista = linhas;
    h += paginar(linhas, function (corte) {
      return '<div class="lista">' + corte.map(function (s, k) {
        return '<button type="button" class="linha" data-sessao="' + (E.pagina * POR_PAGINA + k) +
          '"><span class="sigla">' + esc(s[2].slice(0, 5)) + '</span><span class="corpo"><b>' +
          esc(dataBr(s[1])) + '</b><p>sessão ' + esc(s[2].toLowerCase()) + ' · nº ' + s[0] +
          ' no painel</p></span><span class="lado">' + razao(s[3].length, D.deputados.length) +
          '</span></button>'; }).join('') + '</div>'; });
    h += '<h2>Comissões — composição lida nas reuniões</h2>';
    var com = [];
    deps.forEach(function (d) { numeros(d).comissoes.forEach(function (c) {
      com.push([d.nome, c[1], c[2], c[0]]); }); });
    h += com.length ? tabela(['Deputado', 'Comissão', 'Papel', 'Ano'], com.map(function (c) {
      return [c[0], c[1], c[2], String(c[3])]; })) : '<p class="nota">Nenhuma composição lida no período.</p>';
    E.exportavel = {nome: 'presenca', colunas: ['deputado', 'partido', 'presencas',
      'sessoes_possiveis', 'sem_presenca'], linhas: corpo};
    return h;
  }
  function detalheSessao(k) {
    var s = (E.lista || [])[k]; if (!s) { return; }
    var fora = D.deputados.filter(function (d) { return s[3].indexOf(d.i) < 0; });
    abrirModal('<h3 id="modal-titulo">Sessão ' + esc(s[2].toLowerCase()) + ' — ' + esc(dataBr(s[1])) +
      '</h3><p>' + razao(s[3].length, D.deputados.length) + ' titulares com presença registrada.</p>' +
      '<div class="duas"><div><h2>Com presença</h2><p>' + esc(nomesDe(s[3]) || '—') + '</p></div>' +
      '<div><h2>Sem presença registrada</h2><p>' + esc(fora.map(function (d) { return d.nome; }).join(', ') || '—') +
      '</p></div></div>');
  }

  /* ---------- Calendário ---------- */
  function calendario() {
    chips('', []);
    var grade = {}, porMes = {}, total = 0, semData = 0;
    anos().forEach(function (a) {
      var c = D.calendario.anos[String(a)]; semData += c.sessoes_sem_data;
      c.linhas.forEach(function (l) {
        var k = l[0] + '|' + l[1]; grade[k] = (grade[k] || 0) + l[3];
        porMes[l[0]] = (porMes[l[0]] || 0) + l[3]; total += l[3];
      });
    });
    var h = '<p class="nota">' + inteiro(total) + ' sessões com data no período' +
      (semData ? ' · ' + inteiro(semData) + ' sem data' : '') + '. Linhas: mês · colunas: dia da semana.</p>' +
      '<div class="calor"><div class="cab"></div>' + DIAS.map(function (d) {
        return '<div class="cab">' + d + '</div>'; }).join('');
    var corpo = [];
    MESES.forEach(function (m, i) {
      h += '<div class="cab">' + m + ' <small>' + inteiro(porMes[i + 1] || 0) + '</small></div>';
      DIAS.forEach(function (_, d) {
        var n = grade[(i + 1) + '|' + d] || 0;
        if (n) { corpo.push([m, DIAS[d], n]); }
        h += '<div' + (n ? ' style="background:var(--marca-suave);font-weight:600"' : '') + '>' +
          (n ? inteiro(n) : '·') + '</div>';
      });
    });
    h += '</div><h2>O que a norma diz</h2>';
    h += D.calendario.norma.map(function (c) {
      return '<div class="cita"><b>' + esc(c.referencia) + '</b>' + esc(c.texto) + '</div>'; }).join('') ||
      '<p class="nota">Nenhuma citação registrada.</p>';
    E.exportavel = {nome: 'calendario', colunas: ['mes', 'dia_da_semana', 'sessoes'], linhas: corpo};
    return h;
  }

  /* ---------- Votações ---------- */
  function votacoes(feeds) {
    var plen = [], com = [];
    feeds.forEach(function (f) { plen = plen.concat(f.plenario); com = com.concat(f.comissao); });
    var q = semAcento(E.busca), deps = depsFiltrados(), h = '';
    var sub = E.sub;
    h += '<div class="chips" style="margin-bottom:10px"><button type="button" class="chip" data-sub="plenario" aria-pressed="' +
      (sub === 'plenario') + '">Plenário<small>' + inteiro(plen.length) + '</small></button>' +
      '<button type="button" class="chip" data-sub="comissao" aria-pressed="' + (sub === 'comissao') +
      '">Comissões<small>' + inteiro(com.length) + '</small></button></div>';
    if (sub === 'plenario') {
      chips('', []);
      var linhas = plen.filter(function (m) {
        if (!passaPartido(m[4].map(function (x) { return x[0]; }))) { return false; }
        return !q || semAcento(m[2]).indexOf(q) >= 0; });
      E.lista = linhas;
      h += '<div class="legenda"><span style="--c:var(--sim)">Sim</span><span style="--c:var(--nao)">Não</span>' +
        '<span style="--c:var(--abst)">Abstenção</span><span style="--c:var(--nada)">sem voto registrado</span></div>';
      h += paginar(linhas, function (corte) {
        return '<div class="rolagem"><table class="matriz"><thead><tr><th>Data</th><th>Matéria</th>' +
          deps.map(function (d) { return '<th class="dep" title="' + esc(d.nome) + '">' + esc(d.nome) + '</th>'; }).join('') +
          '</tr></thead><tbody>' + corte.map(function (m, k) {
            var por = {}; m[4].forEach(function (v) { (por[v[0]] = por[v[0]] || []).push(v[1]); });
            return '<tr><td>' + esc(dataBr(m[1])) + '</td><td class="mat" tabindex="0" data-materia="' +
              (E.pagina * POR_PAGINA + k) + '">' + esc(m[2]) + '</td>' + deps.map(function (d) {
                var vs = por[d.i] || [], v = vs[0] || '';
                return '<td class="v v-' + (String(v).replace(/[^A-Za-z0-9_-]/g, '') || 'nada') + '" title="' +
                  esc(d.nome + ': ' + (vs.length ? vs.join(' · ') : 'sem voto')) + '">' + esc(v ? v[0] : '') +
                  (vs.length > 1 ? '<sup>' + vs.length + '</sup>' : '') + '</td>'; }).join('') + '</tr>'; }).join('') +
          '</tbody></table></div>'; });
      E.exportavel = {nome: 'votacoes-plenario', colunas: ['co_materia', 'data', 'materia', 'deputado', 'voto'],
        linhas: [].concat.apply([], linhas.map(function (m) {
          return m[4].map(function (v) { return [m[0], m[1], m[2], D.deputados[v[0]].nome, v[1]]; }); }))};
    } else {
      var sigla = E.chips.comissao || '';
      var base = com.filter(function (f) {
        if (!passaPartido(f[5].map(function (x) { return x[0]; }))) { return false; }
        return !q || semAcento((f[4] || '') + ' ' + (f[2] || '')).indexOf(q) >= 0; });
      chips('comissao', contar(base, function (f) { return f[2] || 's/ sigla'; }));
      var lc = sigla ? base.filter(function (f) { return (f[2] || 's/ sigla') === sigla; }) : base;
      E.lista = lc;
      h += paginar(lc, function (corte) {
        return '<div class="lista">' + corte.map(function (f, k) {
          var c = {favoravel: 0, contrario: 0, abstencao: 0};
          f[5].forEach(function (x) { c[x[1]] += 1; });
          return '<button type="button" class="linha" data-folha="' + (E.pagina * POR_PAGINA + k) +
            '"><span class="sigla">' + esc(f[2] || '—') + '</span><span class="corpo"><b>' +
            esc(f[4] || ('proposição ' + f[3])) + '</b><p>folha de votação nº ' + f[0] +
            '</p></span><span class="lado"><b>' + esc(dataBr(f[1])) + '</b>' + c.favoravel + ' fav · ' +
            c.contrario + ' contra · ' + c.abstencao + ' abst</span></button>'; }).join('') + '</div>'; });
      E.exportavel = {nome: 'votacoes-comissao', colunas: ['documento_id', 'data', 'comissao',
        'proposicao', 'deputado', 'marca'], linhas: [].concat.apply([], lc.map(function (f) {
        return f[5].map(function (x) { return [f[0], f[1], f[2], f[4] || f[3], D.deputados[x[0]].nome, x[1]]; }); }))};
    }
    return h;
  }
  function listaDeVotos(pares, ordem) {
    return ordem.map(function (v) {
      var quem = pares.filter(function (x) { return x[1] === v; }).map(function (x) { return x[0]; });
      return '<h2>' + esc(v) + ' — ' + razao(quem.length, pares.length) + '</h2><p>' +
        esc(nomesDe(quem) || '—') + '</p>'; }).join('');
  }
  function detalheMateria(k) {
    var m = (E.lista || [])[k]; if (!m) { return; }
    abrirModal('<h3 id="modal-titulo">' + esc(m[2]) + '</h3><p>' + esc(dataBr(m[1])) +
      ' · votação nominal · código ' + m[0] + ' no painel de votação</p>' +
      listaDeVotos(m[4], ['SIM', 'NAO', 'ABSTENCAO']));
  }
  function detalheFolha(k) {
    var f = (E.lista || [])[k]; if (!f) { return; }
    abrirModal('<h3 id="modal-titulo">' + esc(f[2] || 'Comissão') + ' — ' +
      esc(f[4] || ('proposição ' + f[3])) + '</h3><p>' + esc(dataBr(f[1])) +
      ' · folha de votação nº ' + f[0] + '</p>' + listaDeVotos(f[5], ['favoravel', 'contrario', 'abstencao']));
  }

  /* ---------- Fontes ---------- */
  function fontes() {
    chips('', []);
    var h = '<h2>Os onze tipos de ato e de onde vêm</h2>' +
      tabela(['Tipo', 'Ato', 'Fonte', 'Cobertura', 'Atos no ledger'], D.fontes.tipos_ato.map(function (t) {
        return [String(t.tipo_ato), t.nome, t.fonte, t.cobertura, t.atos]; }));
    h += '<h2>Os sistemas públicos lidos</h2><ul>' + D.fontes.registro.map(function (r) {
      return '<li>' + esc(r.descricao) + '<br><a rel="noopener noreferrer" href="' + esc(r.url) +
        '">' + esc(r.url) + '</a></li>'; }).join('') + '</ul>';
    h += '<h2>Como ler esta página</h2><ul><li>Recorte: os ' + inteiro(D.meta.deputados) +
      ' titulares e os anos 2023–2026. Atos de qualquer outro autor aparecem só no total do ledger.</li>' +
      '<li>O painel de presença escreve “SESSAO ORDINARIA” até 2024 e “ORDINARIA” desde 2025; ' +
      'aqui as duas grafias são lidas como o mesmo tipo.</li><li>Os arquivos em <code>dados/</code> ' +
      'guardam só contagens e somas em centavos. Toda porcentagem é calculada nesta página, ao lado ' +
      'dos dois números de que ela sai.</li><li>Os onze tipos de ato estão carregados. Cada ' +
      'número desta página abre, no botão <b>Detalhes</b>, as linhas de ato que o compõem, com ' +
      'a ligação para o artefato público de cada uma — a proposição, o documento ou a reunião ' +
      'na API pública, ou o arquivo e o painel publicados. O painel de presença não expõe ' +
      'endereço por registro, e essas linhas dizem “sem link público” em vez de um endereço ' +
      'adivinhado.</li></ul>';
    E.exportavel = {nome: 'fontes', colunas: ['tipo_ato', 'nome', 'fonte', 'cobertura', 'atos'],
      linhas: D.fontes.tipos_ato.map(function (t) { return [t.tipo_ato, t.nome, t.fonte, t.cobertura, t.atos]; })};
    return h;
  }

  /* ---------- exportar ---------- */
  function celulaCsv(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) { s = "'" + s; }
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportarCsv() {
    var x = E.exportavel; if (!x) { return; }
    var texto = '﻿' + [x.colunas].concat(x.linhas).map(function (l) {
      return l.map(celulaCsv).join(','); }).join('\r\n') + '\r\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], {type: 'text/csv;charset=utf-8'}));
    a.download = 'observatorio-cldf-' + x.nome + '-' + rotuloAno().replace('–', '-') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- relatar (OS-145) ----------
     Um botão presente em toda aba (fora de #painel, no rodapé) abre um formulário que a
     PRÓPRIA PÁGINA envia ao Web3Forms — nenhuma sessão deste projeto faz esse POST; é o
     navegador de quem lê. O campo `estado` carrega o recorte exato que a pessoa via: aba,
     ano, partido, busca e chips, para que um relato diga a que número ele se refere. */
  function formularioRelatar() {
    var estado = JSON.stringify({aba: E.aba, ano: E.ano, partido: E.partido, busca: E.busca,
      chips: E.chips});
    return '<h3 id="modal-titulo">Relatar problema ou sugestão</h3>' +
      '<p class="nota">Sua mensagem é enviada por um serviço de terceiros (Web3Forms) direto ' +
      'ao operador do projeto; esta página não guarda nem lê o que você escrever.</p>' +
      '<form id="form-relatar" class="form-relatar">' +
      '<label for="relatar-mensagem">Mensagem<textarea id="relatar-mensagem" name="message" ' +
      'required rows="5"></textarea></label>' +
      '<label for="relatar-email">Seu e-mail (opcional, para resposta)' +
      '<input id="relatar-email" name="email" type="email"></label>' +
      '<input type="hidden" name="subject" value="Observatório CLDF — relato ou sugestão">' +
      '<input type="hidden" name="from_name" value="Observatório CLDF">' +
      '<input type="hidden" name="estado" value=\'' + esc(estado) + '\'>' +
      '<input type="checkbox" name="botcheck" class="campo-oculto" tabindex="-1" ' +
      'autocomplete="off" aria-hidden="true">' +
      '<p><button type="submit">Enviar</button></p>' +
      '<p id="relatar-status" class="nota" role="status"></p></form>';
  }
  function enviarRelato(form) {
    var status = $('relatar-status'), botao = form.querySelector('button[type=submit]');
    if (form.botcheck.checked) { status.textContent = 'Mensagem enviada. Obrigado.'; form.reset(); return; }
    var corpo = {access_key: window.CHAVE_WEB3FORMS, message: form.message.value,
      email: form.email.value, subject: form.subject.value, from_name: form.from_name.value,
      estado: form.estado.value};
    botao.disabled = true; status.textContent = 'Enviando…';
    fetch('https://api.web3forms.com/submit', {method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify(corpo)})
      .then(function (r) { return r.json(); })
      .then(function (j) {
        botao.disabled = false;
        if (j.success) { status.textContent = 'Mensagem enviada. Obrigado.'; form.reset(); }
        else { status.textContent = 'Não foi possível enviar: ' + (j.message || 'erro desconhecido') + '. Tente novamente.'; }
      })
      .catch(function (e) {
        botao.disabled = false;
        status.textContent = 'Não foi possível enviar: ' + e.message + '. Tente novamente.';
      });
  }

  /* ---------- desenhar ---------- */
  function contas() {
    var c = {deputados: D.meta.deputados, proposicoes: metaSoma('proposicoes'),
      emendas: metaSoma('emendas'), presenca: soma(metaMapa('sessoes')),
      calendario: soma(metaMapa('sessoes')),
      votacoes: metaSoma('materias_plenario') + metaSoma('folhas_comissao'),
      fontes: D.fontes.tipos_ato.length + D.fontes.registro.length};
    Array.prototype.forEach.call(document.querySelectorAll('[data-conta]'), function (el) {
      var k = el.getAttribute('data-conta'); el.textContent = k in c ? inteiro(c[k]) : '';
    });
  }
  var desenho = 0;
  function desenhar() {
    var vez = ++desenho, painel = $('painel');
    Array.prototype.forEach.call(document.querySelectorAll('.aba'), function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-aba') === E.aba)); });
    contas();
    var mapa = {visao: [null, visao], deputados: [null, deputados], calendario: [null, calendario],
      fontes: [null, fontes], proposicoes: ['proposicoes', proposicoes], emendas: ['emendas', emendas],
      presenca: ['presenca', presenca], votacoes: ['votacoes', votacoes]};
    var par = mapa[E.aba] || mapa.visao;
    var pronto = par[0] ? carregarAno(par[0]) : Promise.resolve(null);
    if (par[0]) { painel.innerHTML = '<p class="aviso">Carregando…</p>'; }
    pronto.then(function (feeds) {
      if (vez !== desenho) { return; }
      painel.innerHTML = par[1](feeds);
      history.replaceState(null, '', '#' + NOMES_ABA[E.aba] + '/' + E.ano);
    }).catch(function (e) {
      painel.innerHTML = '<p class="aviso">Não foi possível ler os dados: ' + esc(e.message) + '</p>';
    });
  }
  function reiniciar() { E.pagina = 0; desenhar(); }

  /* ---------- eventos ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-aba],[data-grupo],[data-pag],[data-perfil],[data-prop],' +
      '[data-emenda],[data-sessao],[data-materia],[data-folha],[data-sub],[data-detalhe],' +
      '[data-pagm],[data-ir],#abrir-comparar,#abrir-relatar,#limpar,#exportar-csv,#exportar-pdf,' +
      '#modal-fechar');
    if (ev.target === $('modal')) { fecharModal(); return; }
    if (!t) { return; }
    if (t.id === 'modal-fechar') { fecharModal(); }
    else if (t.id === 'exportar-csv') { exportarCsv(); }
    else if (t.id === 'exportar-pdf') { window.print(); }
    else if (t.id === 'abrir-comparar') { comparar(); }
    else if (t.id === 'abrir-relatar') { abrirModal(formularioRelatar()); }
    else if (t.id === 'limpar') {
      E.busca = ''; E.partido = ''; E.chips = {}; $('busca').value = ''; $('partido').value = ''; reiniciar();
    } else if (t.hasAttribute('data-aba')) { E.aba = t.getAttribute('data-aba'); E.chips = {}; reiniciar(); }
    else if (t.hasAttribute('data-sub')) { E.sub = t.getAttribute('data-sub'); E.chips = {}; reiniciar(); }
    else if (t.hasAttribute('data-grupo')) {
      var g = t.getAttribute('data-grupo'), v = t.getAttribute('data-valor');
      E.chips[g] = E.chips[g] === v ? '' : v; reiniciar();
    } else if (t.hasAttribute('data-pag')) {
      E.pagina = Math.max(0, E.pagina + Number(t.getAttribute('data-pag'))); desenhar();
      $('painel').scrollIntoView();
    } else if (t.hasAttribute('data-perfil')) { perfil(Number(t.getAttribute('data-perfil'))); }
    else if (t.hasAttribute('data-prop')) { detalheProposicao(Number(t.getAttribute('data-prop'))); }
    else if (t.hasAttribute('data-emenda')) { detalheEmenda(Number(t.getAttribute('data-emenda'))); }
    else if (t.hasAttribute('data-sessao')) { detalheSessao(Number(t.getAttribute('data-sessao'))); }
    else if (t.hasAttribute('data-materia')) { detalheMateria(Number(t.getAttribute('data-materia'))); }
    else if (t.hasAttribute('data-folha')) { detalheFolha(Number(t.getAttribute('data-folha'))); }
    else if (t.hasAttribute('data-detalhe')) {
      var dp = t.getAttribute('data-dep');
      abrirDetalhe({tipos: t.getAttribute('data-detalhe').split(',').map(Number),
        rotulo: t.getAttribute('data-rot') || 'Detalhes',
        dep: dp === null ? null : Number(dp), fonte: t.getAttribute('data-fonte') || ''});
    } else if (t.hasAttribute('data-pagm')) {
      E.paginaModal = Math.max(0, E.paginaModal + Number(t.getAttribute('data-pagm')));
      desenharDetalhe();
    } else if (t.hasAttribute('data-ir')) {
      fecharModal();
      E.aba = t.getAttribute('data-ir'); E.chips = {};
      if (t.getAttribute('data-ir-sub')) { E.sub = t.getAttribute('data-ir-sub'); }
      reiniciar();
    }
  });
  document.addEventListener('submit', function (ev) {
    if (ev.target && ev.target.id === 'form-relatar') { ev.preventDefault(); enviarRelato(ev.target); }
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'ano') { E.ano = t.value; reiniciar(); }
    else if (t.id === 'partido') { E.partido = t.value; reiniciar(); }
    else if (t.hasAttribute && t.hasAttribute('data-comparar')) {
      var i = Number(t.getAttribute('data-comparar')), k = E.comparar.indexOf(i);
      if (k >= 0) { E.comparar.splice(k, 1); }
      else { E.comparar.push(i); if (E.comparar.length > 2) { E.comparar.shift(); } }
      desenhar();
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !$('modal').hidden) { fecharModal(); }
    if (ev.key === 'Enter' && ev.target.hasAttribute && ev.target.hasAttribute('data-materia')) {
      detalheMateria(Number(ev.target.getAttribute('data-materia')));
    }
  });
  var espera = null;
  $('busca').addEventListener('input', function (ev) {
    clearTimeout(espera);
    espera = setTimeout(function () { E.busca = ev.target.value; reiniciar(); }, 180);
  });

  /* ---------- partida ---------- */
  Promise.all([ler('dados/meta.json'), ler('dados/deputados.json'), ler('dados/calendario.json'),
    ler('dados/fontes.json')]).then(function (r) {
    D.meta = r[0]; D.deputados = r[1]; D.calendario = r[2]; D.fontes = r[3];
    var partidos = {};
    D.deputados.forEach(function (d) { if (d.partido) { partidos[d.partido] = 1; } });
    $('partido').innerHTML += Object.keys(partidos).sort().map(function (p) {
      return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('');
    var partes = location.hash.replace('#', '').split('/');
    Object.keys(NOMES_ABA).forEach(function (k) { if (NOMES_ABA[k] === partes[0]) { E.aba = k; } });
    var pedido = partes[1];
    if (pedido === 'todos' || D.meta.anos_disponiveis.indexOf(Number(pedido)) >= 0) { $('ano').value = pedido; }
    E.ano = $('ano').value;
    desenhar();
  }).catch(function (e) {
    $('painel').innerHTML = '<p class="aviso">Não foi possível ler os dados: ' + esc(e.message) +
      '. Esta página precisa ser servida por HTTP.</p>';
  });
}());
