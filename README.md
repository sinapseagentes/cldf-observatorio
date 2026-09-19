# Observatório CLDF

Os atos dos 25 deputados distritais titulares da Câmara Legislativa do Distrito Federal,
2023–2026, relidos do registro público da própria CLDF: proposições, assinaturas,
pareceres, votos em plenário e em comissão, presença, emendas ao orçamento e composição de
comissões.

Site: https://sinapseagentes.github.io/cldf-observatorio/

Versão 0.52.0.

## O que há nesta árvore

- `index.html`, `observ.css`, `observ.js` — a página. Nenhuma dependência, nenhum pedido a
  outro servidor.
- `dados/*.json` — 20 arquivos. Cada campo é uma **contagem** ou uma
  **soma inteira em centavos**; nenhum arquivo guarda porcentagem, média, índice ou
  ranking. Toda porcentagem que a página mostra é calculada no navegador, ao lado do
  numerador e do denominador.

## Como conferir

Cada número por deputado e por ano foi conferido, antes de esta árvore ser escrita, contra
uma segunda leitura independente do ledger (700 células
conferidas, 0 divergências). Os dados de origem — as 30 tabelas do modelo dimensional — estão
publicados em CSV, com a consulta exata ao lado de cada uma, no painel de dados do projeto.

## O que ainda não está aqui

Situação final das proposições, verba indenizatória, diárias e custo de gabinete ainda não
estão carregados no ledger. A página mostra "n/d" onde eles entrariam, nunca uma estimativa.

## Licenças

Dados: CC BY-SA 4.0 (`LICENSE-data`), o termo da própria fonte. Código e interface:
PolyForm Noncommercial 1.0.0 (`LICENSE`).
