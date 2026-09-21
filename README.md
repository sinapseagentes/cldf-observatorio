# Observatório CLDF

Os atos dos 25 deputados distritais titulares da Câmara Legislativa do Distrito Federal,
2023–2026, relidos do registro público da própria CLDF: proposições, assinaturas,
pareceres, votos em plenário e em comissão, presença, emendas ao orçamento e composição de
comissões.

Site: https://sinapseagentes.github.io/cldf-observatorio/

Versão 0.56.0.

## O que há nesta árvore

- `index.html`, `observ.css`, `observ.js` — a página. Nenhuma dependência, nenhum pedido a
  outro servidor.
- `dados/*.json` — 64 arquivos. Cada campo é uma **contagem** ou uma
  **soma inteira em centavos**; nenhum arquivo guarda porcentagem, média, índice ou
  ranking. Toda porcentagem que a página mostra é calculada no navegador, ao lado do
  numerador e do denominador.

## Como conferir

Cada número por deputado e por ano foi conferido, antes de esta árvore ser escrita, contra
uma segunda leitura independente do ledger (700 células
conferidas, 0 divergências). Os dados de origem — as 30 tabelas do modelo dimensional — estão
publicados em CSV, com a consulta exata ao lado de cada uma, no painel de dados do projeto.

## Do número até o documento

Cada número desta página tem um botão **Detalhes** que abre as linhas de ato que o compõem,
sob os mesmos filtros da tela. Cada linha traz a data, o identificador do objeto e a ligação
para o artefato público mais fino que a fonte expõe — a proposição, o texto do documento ou
a reunião na API pública da CLDF, ou o arquivo e o painel que a CLDF publica.
154445 linhas de detalhe, em 13 pares
de (tipo de ato, fonte), foram recontadas e ressomadas contra o ledger antes de esta árvore
ser escrita (880 células, 0 divergências).

O painel de presença não publica endereço por registro — foi lido por consulta, e nenhuma
consulta gravada carrega uma URL de visualização. Essas linhas dizem **"sem link público"**
em vez de um endereço adivinhado.

## Licenças

Dados: CC BY-SA 4.0 (`LICENSE-data`), o termo da própria fonte. Código e interface:
PolyForm Noncommercial 1.0.0 (`LICENSE`).
