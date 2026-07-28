# Decisão: URL da loja, slug e marca provisional

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling #15  
**Trade-off:** ver [pesquisa 09](../pesquisa/09-subdominio-vs-path.md)

## Decisão (MVP)

- Formato: **`https://foodedelivery.com.br/loja/[slug]`**
- Motivo: menos risco ops/SSL/segurança no caminho; construção mais simples; path `/loja/` isola de páginas de marketing, SEO institucional, blog, etc.
- **Subdomínio** e **domínio próprio do lojista:** pós-MVP (se fizer sentido depois).

## Slug

- Comerciante **escolhe o slug** na criação da loja (respeitando padrão da plataforma: caracteres permitidos, tamanho, lista de reservados).
- **Unicidade global:** slugs **não repetem**.
- Exemplos de reservados a bloquear no segmento após `/loja/` e em rotas irmãs: nomes que colidam com sistema (`admin`, `api`, `login`, etc.) — lista fina na implementação.

## Marca (provisional)

| | |
| --- | --- |
| Nome do produto | **Foode Delivery** |
| Domínio | **foodedelivery.com.br** |

Pode ser revisitado; URL pattern `/loja/[slug]` permanece válido se o domínio mudar.
