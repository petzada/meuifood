# Ticket 01: review de Standards

**Fixed point:** `a4f0418a2c428f6618e2b43496c729a598923a2e`
**Commit revisado:** `1251ac4 feat: bootstrap monorepo e identidade Foode`

## Achados e decisões

| Achado | Viabilidade e decisão | Resultado |
| --- | --- | --- |
| A landing usava “clientes”, termo ambíguo no glossário. | Correção simples e obrigatória. | **Corrigido:** headline reescrita com `Loja`, sem empregar o termo ambíguo. |
| Web e admin usavam peso 800 e displays maiores que a escala Foode. | As docs de marca prevalecem sobre a recomendação genérica da taste-skill. | **Corrigido:** pesos limitados a 700 e displays limitados a 28px. |
| A seção “como funciona” tinha fill `primary-soft`. | Violava diretamente a linguagem outline. | **Corrigido:** seção sem fill, delimitada apenas por hairlines. |
| O ticket não possuía histórico sob `## Comments`. | Obrigatório pela convenção do issue tracker. | **Corrigido:** histórico de implementação, checks e review registrado no ticket. |
| Button próprio em vez de shadcn seletivo. | Viável no bootstrap sem trazer catálogo amplo. | **Corrigido:** primitive owned-code customizada no padrão shadcn, com Radix Slot e CVA, mantendo tokens Foode. |
| Paleta duplicada em CSS e TypeScript. | Duplicação criava duas fontes de verdade. | **Corrigido:** tokens de marca permanecem somente no CSS canônico compartilhado. |
| Wrapper do logo repetido entre apps. | Primitive visual pequena e estável, adequada ao package UI. | **Corrigido:** `BrandMark` compartilhado por web e admin. |

Não houve achado deferido. Os smells foram tratados como heurísticas e aplicados somente onde a extração reduziu duplicação real.

## Evidências de validação

- `pnpm lint`: passou nos seis workspaces.
- `pnpm typecheck`: passou nos seis workspaces.
- `pnpm test`: passou, 5 testes em 4 arquivos; os packages scaffold usam `--passWithNoTests`.
- `pnpm build`: passou; web/admin prerenderizados e API/packages compilados.
- Auditoria `rg`: sem pesos 800, termo “Seus clientes”, em/en-dash visível ou termos/números proibidos nos arquivos do ticket.
- Pre-flight visual final do build de produção: desktop 1440x1000 e mobile 500x900, com logo legível, CTA na dobra, imagem real e layout sem overflow.
