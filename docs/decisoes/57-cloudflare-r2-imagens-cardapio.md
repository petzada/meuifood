# Decisão: Cloudflare R2 para imagens do Cardápio

**Data:** jul/2026 · **Status:** decidido · **Sessão:** GATE-DOC-R2 (desbloqueio Ticket 05)  
**Depende de:** [25](25-hospedagem-ci-ops.md) · [28](28-tese-stack-mvp.md) · [29](29-libs-ops-acrescimos-mvp.md) · [38](38-rbac-dono-operador-mvp.md) · ADR [0002](../adr/0002-railway-supabase-nao-vercel.md)

**Supersede:** uso de **Supabase Storage** para imagens do Cardápio em [25](25-hospedagem-ci-ops.md), [28](28-tese-stack-mvp.md), [29](29-libs-ops-acrescimos-mvp.md) e no texto histórico do ADR [0002](../adr/0002-railway-supabase-nao-vercel.md). Supabase **permanece** Postgres + Auth + RLS; esta decisão **não** reabre hospedagem nem auth.

## Decisão

Objetos de imagem do Cardápio ficam no **Cloudflare R2** (API S3-compatível):

| Peça | MVP |
| --- | --- |
| Leitura | Bucket público por domínio/CDN — URL base `R2_PUBLIC_BASE_URL`. **Sem** URLs assinadas de leitura |
| Upload | URL **PUT pré-assinada** emitida pela `api` após autenticação/autorização |
| Credenciais R2 | Somente no serviço `api` / Railway. Frontend recebe só URL pré-assinada (upload) e URL pública (leitura) |
| Cliente SDK | `@aws-sdk/client-s3` + presigner S3 — **autorizados** para a implementação do Ticket 05; não adicionados nesta etapa documental |

## Contrato mínimo da API

1. **RBAC:** somente o **Dono** pode solicitar upload; **Operador** é negado.
2. **Antes de assinar:** a API valida `store_id` do contexto autenticado, MIME e tamanho.
3. **Chave do objeto:** gerada **pelo servidor** no formato equivalente a `stores/{store_id}/menu/{uuid}.{ext}`. O cliente **não** escolhe prefixo nem path.
4. **MIME / tamanho:** JPEG, PNG ou WebP; máximo **5 MiB**.
5. **Troca / remoção:** tenta apagar o objeto antigo com comportamento **seguro e observável**; **nunca** apaga objetos de outra Loja (prefixo/`store_id` isolados).
6. **Prova de integração (quando houver credenciais de teste):** Seam estreita com **um** objeto sintético único no R2 real, cleanup **exato e verificado**. Esta decisão **não** inventa execução nem marca aceite.

## Variáveis de ambiente (contrato)

Somente na `api` / Railway (ver `.env.example`):

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`

## Por quê

Separar objetos de mídia do Cardápio do Supabase Storage reduz acoplamento de storage ao provedor de Auth/DB, mantém leitura pública barata via CDN/base URL e concentra upload autorizado na `api` (PUT pré-assinado). Supabase continua a âncora de Postgres/Auth/RLS.

## Rejeitado

- Manter Supabase Storage para fotos do Cardápio no MVP.
- Credenciais R2 no frontend (`web` / `admin`).
- Cliente escolhendo prefixo/path do objeto.
- URLs assinadas de leitura para imagens públicas do Cardápio.
- Operador solicitando ou concluindo upload de imagem.

## Impacto em documentos

- [25](25-hospedagem-ci-ops.md), [28](28-tese-stack-mvp.md), [29](29-libs-ops-acrescimos-mvp.md) — notas de supersessão / ponte.
- ADR [0002](../adr/0002-railway-supabase-nao-vercel.md) — amend parcial auditável (Storage do Cardápio → R2).
- Spec e Ticket [05](../../.scratch/mvp-foode-delivery/issues/05-cardapio-admin-storefront.md) — Storage → R2; status do ticket permanece `ready-for-agent`.
- `docs/pesquisa/` permanece histórico não normativo.
