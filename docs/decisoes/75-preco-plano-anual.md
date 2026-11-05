# 75 — Preço do plano Anual: paga 8 meses, usa 12

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Altera:** [61](61-monetizacao-faixas-taxas-anota.md), [71](71-tarifa-servico-parcelamento-anual.md) (preço do Anual)

- O **Anual** (12 meses, **sem teto de Pedidos**, o plano mais completo) custa **8 × a faixa mais barata do Mensal**: 8 × R$ 84,99 = **R$ 679,92 à vista**.
- Parcelado em até **6×** com juros de **2,99% por parcela** (Tabela Price): **6× de R$ 125,47** (total parcelado R$ 752,82).
- **Badge de desconto** compara com 12 × a faixa do Mensal acima de 250 Pedidos (12 × R$ 254,99 = R$ 3.059,88): desconto real 77,8% → exibido **"77% de desconto"** (arredondado para baixo).
- Todos os valores são calculados a partir das constantes de preço (`@foode/shared`) e da tabela de Plano vigente no `/ops`; nunca escritos à mão.
- Card na landing: subheadline "Pedidos ilimitados por um valor fixo"; "6×" numa linha e "R$ 125,47" abaixo com mais peso; "ou R$ 679,92 à vista" sem destaque; badge amarela sobre a borda do card.
- Implementação: constante do Anual em `@foode/shared`, nova vigência do preço do Anual na tabela de Plano (sem alterar vigências passadas), landing e `/precos`.
