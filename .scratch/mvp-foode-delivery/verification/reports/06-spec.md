# Ticket 06 — revisão de aderência à spec

**Base:** `8878bd1`  
**Branch:** `cursor/complementos-adicionais-carrinho-391f`  
**Status:** aprovado para revisão após correções e CI remoto verde

## Resultado por requisito

- Dono configura grupos obrigatórios/opcionais, opções ordenadas e grupos
  ordenados: implementado no Admin, API e persistência.
- Dono configura Adicionais em centavos, disponibilidade e ordem determinística:
  implementado.
- Regras inválidas falham atomicamente: criação obrigatória sem opções retorna
  400 e a prova HTTP verifica catálogo sem resíduo; replace ocorre na mesma
  transação.
- Operador e outra Loja: rotas exigem Dono; RLS e referências compostas isolam
  `store_id`; prova HTTP cobre 403/404 e tentativa de referência cruzada.
- Complemento obrigatório: a UI desabilita a inclusão até escolhas válidas e o
  helper rejeita ausência/opção alienígena.
- Quantidade e Adicionais: prévia usa apenas centavos inteiros e reage às
  escolhas e quantidade.
- Carrinho single-Loja: o contrato contém `storeSlug`; hidratação de outro slug
  mostra bloqueio imediato e exige esvaziar antes de usar o Cardápio atual.
- Navegador mantém apenas prévia: `localStorage` contém IDs canônicos,
  quantidade e slug, sem preços; total é recalculado contra a projeção pública.
- Snapshots de Pedidos: nenhum modelo/fluxo de Pedido foi criado. Ticket 08 não
  foi antecipado.

## Achados e resolução

1. **Procedente — carrinho de outro slug silencioso na hidratação:** corrigido
   com alerta imediato e ação explícita para esvaziar o carrinho anterior.
2. **Procedente — IDs de opções regenerados em save sem mudança:** corrigido com
   reconciliação por identidade semântica; opções iguais preservam UUID.
3. **Procedente — prova de atomicidade implícita:** adicionada asserção explícita
   de zero grupos após a requisição inválida.
4. **Não aplicável — ordenação de Adicionais como escopo extra:** o prompt exige
   ordenação determinística e a projeção pública depende de ordem estável. A
   implementação fica em módulo próprio e não antecipa outro ticket.

## Evidência remota

O teste `menu-customization-routes.test.ts` foi tentado localmente e parou antes
de executar por ausência das credenciais do Supabase de produção. Pela Decisão
55, migration e prova HTTP/RLS/RBAC devem rodar no workflow remoto após
`quality`; não foi criado banco local nem aplicada migration fora do CI.

O workflow `30405455056` da PR #14 concluiu com `quality`, `migrate` e
`integration` verdes no commit `054454e`. O job de integração executou a prova
HTTP/RLS/RBAC no Supabase de produção e verificou cleanup das fixtures.

## Revalidação

Após as correções, a revisão de Spec foi repetida no diff completo e retornou
`PASS`. A prova remota factual também passou.
