# Cloudflare Workers + D1, com isolamento por código em vez de RLS

Os três apps rodam em Workers (web e admin via OpenNext, api em Hono) e o banco é um único **D1**. Supersede [0002](0002-railway-supabase-nao-vercel.md). Detalhes em [59](../decisoes/59-pivo-cloudflare-d1-workers.md).

O que surpreende: abrimos mão da RLS do Postgres, que foi a prova de isolamento dos Tickets 02–09. No D1 não há RLS, roles nem transação interativa. O isolamento entre Lojas passa a ser invariante de código — `packages/db` só expõe operações com contexto de Loja, rotas não tocam o D1 direto (lint) e testes de vazamento com duas Lojas rodam em todo PR (vitest-pool-workers no CI; migrations provadas num D1 remoto efêmero). Escritas condicionais usam `batch` atômico e constraints.

Por quê: o Dono já opera esse stack no ceremony, a escala é ~10 Lojas, e o modelo anterior (migration aplicada no banco de produção a cada PR) gerou drift recorrente. Testes no CI (workerd + D1 SQLite) e migrations provadas num D1 remoto efêmero substituem o "testar só em produção", sem banco local.

**Considered:** manter Supabase + Railway · Hyperdrive + Postgres externo · um D1 por Loja · API nas rotas do Next.  
**Rejected:** Postgres fora da Cloudflare; banco por tenant; migrar dados do Supabase (descartados).
