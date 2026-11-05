# 73 — Sugestão de taxa de entrega por km (só sugestão)

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Mantém:** [42](42-taxa-delivery-bairro-ou-fixa.md) · **Complementa:** [72](72-banner-plano-sidebar.md)

## Decisão

Em Configurações › Entrega:

1. Campo **"Quanto você cobra por km (R$)"** — serve **só para sugerir valores**. A decisão 42 continua: o checkout cobra **por bairro ou Taxa fixa**, nunca por km.
2. Ao cadastrar um bairro, o Painel busca o **centro do bairro** e o centro do bairro do endereço da Loja por geocodificação gratuita (**OpenStreetMap Nominatim**, chamada do navegador). Distância = linha reta (haversine) × **1,3**. O **placeholder** do campo de taxa do bairro mostra `R$ X,XX` = distância × R$/km; o lojista confirma digitando. Falha (bairro não achado, rede, limite) é silenciosa: placeholder `R$ 0,00`.
3. **Taxa fixa sugerida** = R$/km × distância média dos bairros cadastrados (ou **3 km** sem bairro com distância). **Pedido mínimo sugerido** = **3×** a Taxa fixa sugerida. Também como placeholder.
4. Todos os campos de dinheiro do Painel com máscara **"R$ 0,00"** enquanto digita (centavos), validando o formato.

## Política de uso do Nominatim

- No máximo **1 requisição por segundo** (fila única por aba), **cache em memória** (a mesma consulta não repete), consulta só do que o lojista cadastra (nada em massa).
- Identificação: o navegador não permite definir `User-Agent`; vai o `Referer` com a origem do Painel (`admin.foodedelivery.com.br`), como a política pede para apps no navegador.
- Só nome de bairro, cidade e UF na consulta — nenhum dado pessoal.

## Persistência do R$/km

- **Sem migration agora** (a 0007 está no PR do Ticket 26): o R$/km fica **no navegador, por Loja** (`localStorage`, chave `foode.painel.reais-por-km.v1:{storeId}`). Não vai no envio do formulário nem para a api.
- Se o Dono quiser o valor compartilhado entre aparelhos, o orquestrador cria a migration 0008 (coluna nullable em `store_operation_settings`, expand) depois do merge do 26.

## Código

- Regra pura: `apps/admin/src/lib/delivery-suggestion.ts` (haversine, fator 1,3, taxa, Taxa fixa e mínimo); geocodificador: `apps/admin/src/lib/geocode.ts`; máscara: `apps/admin/src/lib/money-mask.ts`.
