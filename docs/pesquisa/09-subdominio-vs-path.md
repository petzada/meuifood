# Análise: subdomínio vs path (URL da loja)

**Data:** jul/2026 · **Tipo:** trade-off técnico/produto · **Decisão fechada:** path MVP — ver [15](../decisoes/15-url-slug-e-marca-provisional.md)

**Contexto:** marca provisional **Foode Delivery** · domínio **foodedelivery.com.br** · sem custom domain do lojista no MVP.

## Comparativo

| | Path `foodedelivery.com.br/loja/slug` | Subdomínio `slug.foodedelivery.com.br` |
| --- | --- | --- |
| Percepção do lojista | “Estou dentro do Foode” | “Tenho meu cantinho” — **mais destaque** |
| App (código) | Lê slug do path | Lê slug do **Host** — esforço de lógica **parecido** |
| DNS | 1 registro (ou poucos) | Precisa **wildcard** `*.foodedelivery.com.br` |
| SSL/HTTPS | 1 certificado no apex/www | Precisa **wildcard SSL** (ou emitir cert por loja — pior) |
| Cookies / auth | Mais simples | Cuidado com domínio de cookie (`.foodedelivery.com.br`) se painel e loja compartilharem sessão |
| Reservados | Poucos (`/admin`, `/api`) | Bloquear `www`, `app`, `api`, `admin`, `painel`, `static`, etc. |
| Deploy (Vercel/etc.) | Funciona “no automático” | Wildcard + domínio ok na maioria dos PaaS modernos, mas **1 passo a mais de setup** |
| SEO local | Path sob o domínio da marca | Subdomínio costuma ser tratado como host distinto (irrelevante se descoberta é QR/Zap) |
| Risco ops | Baixo | Médio: misconfig DNS/SSL; subdomain takeover se DNS frouxo |

## É “o mesmo trabalho”?

**Não exatamente.**

- **Lógica de produto (resolver loja → cardápio):** quase o mesmo (slug → workspace).
- **Infra:** subdomínio exige **wildcard DNS + wildcard TLS + roteamento por Host** + lista de subdomínios reservados. Path evita isso.
- Depois de configurado uma vez, o custo marginal por loja nova é **igual** nos dois (só criar o slug).

## Riscos específicos do subdomínio

1. Esquecer wildcard SSL → loja nova com HTTPS quebrado.  
2. Slug colidir com nome técnico (`api`, `app`).  
3. Cookies mal definidos vazando sessão entre `painel` e `loja`.  
4. E-mail/CORS/webhooks apontando para host errado em ambiente multi-tenant.

Nada disso é bloqueante; é disciplina de setup.

## Domínio próprio do lojista

**Só pós-MVP** (já alinhado) — aí sim sobe bem a complexidade (DNS do cliente, verificação, SSL por domínio).

## Marca (provisional)

- Nome: **Foode Delivery**  
- Domínio: **foodedelivery.com.br**  
Fechar URL não obriga fechar marca para sempre; convém gravar como **provisional** se confirmar o formato.
