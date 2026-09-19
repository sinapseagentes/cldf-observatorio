'use strict';
(function () {
  var NOMES_ABA = {visao: 'visao-geral', deputados: 'deputados', proposicoes: 'proposicoes',
    emendas: 'emendas', presenca: 'presenca', calendario: 'calendario', votacoes: 'votacoes',
    fontes: 'fontes'};
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  var POR_PAGINA = 50;
  var E = {aba: 'visao', ano: null, busca: '', partido: '', chips: {}, pagina: 0,
    comparar: [], sub: 'plenario', exportavel: null};
  var D = {meta: null, deputados: null, calendario: null, fontes: null, porAno: {}};
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
        bloqueado_centavos: 0, disponivel_centavos: 0}};
    anos().forEach(function (a) {
      var c = dep.anos[String(a)], m = D.meta.anos[String(a)];
      ['atos', 'apresentou_por_sigla', 'votos_plenario', 'votos_comissao', 'presencas',
        'sem_presenca'].forEach(function (k) { somaEm(t[k], c[k]); });
      somaEm(t.emendas, c.emendas);
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
  function kpi(rot, val, sub) {
    return '<div class="kpi"><div class="rot">' + esc(rot) + '</div><div class="val">' + val +
      '</div><div class="sub">' + (sub || '') + '</div></div>';
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
    focoAnterior = document.activeElement;
    $('modal-corpo').innerHTML = html; $('modal').hidden = false; $('modal-fechar').focus();
  }
  function fecharModal() {
    $('modal').hidden = true; $('modal-corpo').innerHTML = '';
    if (focoAnterior && focoAnterior.focus) { focoAnterior.focus(); }
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
      kpi('Atos dos titulares', inteiro(soma(tit)), razao(soma(tit), soma(led)) + ' dos atos do ledger no período') +
      kpi('Proposições', inteiro(metaSoma('proposicoes')), 'com ao menos um titular entre os autores') +
      kpi('Emendas ao orçamento', inteiro(em.n), reais(em.valor_centavos) + ' somados') +
      kpi('Empenhado das emendas', reais(em.empenhado_centavos), 'de ' + reais(em.lei_centavos) + ' em lei (painel de emendas)') +
      kpi('Sessões plenárias', inteiro(soma(sess)), Object.keys(sess).sort().map(function (k) {
        return esc(k.toLowerCase()) + ' ' + inteiro(sess[k]); }).join(' · ')) +
      kpi('Presenças registradas', razao(pres, poss), 'presenças sobre sessões possíveis' + barra(pres, poss)) +
      kpi('Matérias votadas em plenário', inteiro(metaSoma('materias_plenario')), 'votação nominal') +
      kpi('Folhas de votação em comissão', inteiro(metaSoma('folhas_comissao')), 'com ao menos uma marca lida') +
      '</div>';
    h += '<h2>Atos por tipo</h2><div class="rolagem"><table class="tipos"><thead><tr><th>Tipo</th>' +
      '<th>Ato</th><th class="num">Titulares</th><th class="num">Ledger</th></tr></thead><tbody>';
    D.meta.tipos_ato.forEach(function (t) {
      var k = String(t.tipo_ato), fora = t.atos === 0;
      h += '<tr' + (fora ? ' class="fora"' : '') + '><td>' + t.tipo_ato + '</td><td>' + esc(t.nome) +
        (fora ? ' — <em>ainda não carregado</em>' : '') + '</td><td class="num">' +
        inteiro(tit[k] || 0) + '</td><td class="num">' + inteiro(led[k] || 0) + '</td></tr>';
    });
    h += '</tbody></table></div><h2>Por deputado</h2>';
    var cab = ['Deputado', 'Partido', 'Apresentou', 'Assinou', 'Relatou', 'Votou', 'Presenças',
      'Emendas', 'Emendas (R$)', 'Comissões'];
    var corpo = linhas.map(function (x) {
      var d = x[0], n = x[1];
      return [d.nome, d.partido || '', n.atos['1'] || 0, n.atos['2'] || 0, n.atos['3'] || 0,
        n.atos['4'] || 0, n.atos['5'] || 0, n.emendas.n, n.emendas.valor_centavos, n.atos['10'] || 0];
    });
    h += tabela(cab, corpo, [8]);
    E.exportavel = {nome: 'visao-geral', colunas: cab.slice(0, 8).concat(['emendas_centavos', 'Comissões']), linhas: corpo};
    return h;
  }
  function tabela(cab, corpo, colunasDeDinheiro) {
    var din = colunasDeDinheiro || [];
    return '<div class="rolagem"><table><thead><tr>' + cab.map(function (c, i) {
      return '<th' + (i > 1 ? ' class="num"' : '') + '>' + esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + corpo.map(function (l) {
        return '<tr>' + l.map(function (v, i) {
          var num = typeof v === 'number';
          return '<td' + (num ? ' class="num"' : '') + '>' +
            (num ? (din.indexOf(i) >= 0 ? reais(v) : inteiro(v)) : esc(v)) + '</td>';
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
        '<div><dt>Proposições</dt><dd>' + inteiro(n.atos['1'] || 0) + '</dd></div>' +
        '<div><dt>Presença</dt><dd>' + razao(p, poss) + '</dd></div>' +
        '<div><dt>Votos em plenário</dt><dd>' + razao(vp, n.materias) + '</dd></div>' +
        '<div><dt>Emendas</dt><dd>' + inteiro(n.emendas.n) + ' · ' + reais(n.emendas.valor_centavos) +
        '</dd></div></dl><footer><button type="button" data-perfil="' + d.i + '">Ver perfil</button>' +
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
        return esc(s) + ' ' + inteiro(n.apresentou_por_sigla[s]); }).join(' · ')) +
      kpi('Assinou documentos', inteiro(n.atos['2'] || 0), 'ato 2 do ledger') +
      kpi('Relatou (parecer)', inteiro(n.atos['3'] || 0), 'onde o relator é atribuível') +
      kpi('Presença', razao(p, poss), barra(p, poss)) + '</div>';
    h += '<h2>Presença por tipo de sessão</h2><ul>';
    Object.keys(n.sessoes).sort().forEach(function (t) {
      var pr = n.presencas[t] || 0, tot = pr + (n.sem_presenca[t] || 0);
      h += '<li>' + esc(t.toLowerCase()) + ': ' + razao(pr, tot) + '</li>';
    });
    h += '</ul><h2>Votos</h2><ul><li>Plenário (nominal): ' +
      ['SIM', 'NAO', 'ABSTENCAO'].map(function (v) {
        return esc(v) + ' ' + inteiro(n.votos_plenario[v] || 0); }).join(' · ') + ' — ' +
      razao(soma(n.votos_plenario), n.materias) + ' das matérias do período</li><li>Comissão (folha de votação): ' +
      ['favoravel', 'contrario', 'abstencao'].map(function (v) {
        return esc(v) + ' ' + inteiro(n.votos_comissao[v] || 0); }).join(' · ') +
      ' · na folha sem marca ' + inteiro(n.votos_comissao.sem_marca || 0) + '</li></ul>';
    h += '<h2>Emendas ao orçamento</h2><ul><li>' + inteiro(n.emendas.n) + ' emendas · ' +
      reais(n.emendas.valor_centavos) + ' somados</li><li>Painel de emendas: ' +
      reais(n.emendas.empenhado_centavos) + ' empenhados de ' + reais(n.emendas.lei_centavos) +
      ' em lei</li></ul><h2>Comissões (reuniões lidas)</h2>';
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
      ' proposições. Situação final: <b>n/d</b> — o ato 11 (obteve resultado) ainda não está ' +
      'carregado no ledger.</p>' + paginar(linhas, function (corte) {
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
      '</li><li>Situação final: n/d (ato 11 não carregado)</li><li>Regiões citadas: ' +
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
      'dos dois números de que ela sai.</li><li>Situação final das proposições, verba indenizatória, ' +
      'diárias e custo de gabinete ainda não estão carregados no ledger e não aparecem.</li></ul>';
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
      '[data-emenda],[data-sessao],[data-materia],[data-folha],[data-sub],#abrir-comparar,#limpar,' +
      '#exportar-csv,#exportar-pdf,#modal-fechar');
    if (ev.target === $('modal')) { fecharModal(); return; }
    if (!t) { return; }
    if (t.id === 'modal-fechar') { fecharModal(); }
    else if (t.id === 'exportar-csv') { exportarCsv(); }
    else if (t.id === 'exportar-pdf') { window.print(); }
    else if (t.id === 'abrir-comparar') { comparar(); }
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
