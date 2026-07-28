# Railway + Supabase (não Vercel)

Apps e cron na **Railway**; Postgres, Auth e RLS no **Supabase**. Vercel não é o host padrão do Foode.

**Supersessão parcial (jul/2026 — GATE-DOC-R2):** o escopo original incluía **Storage** no mesmo fornecedor do banco. Objetos de imagem do **Cardápio** passam a **Cloudflare R2** (PUT pré-assinado; leitura pública via `R2_PUBLIC_BASE_URL`) — ver [57](../decisoes/57-cloudflare-r2-imagens-cardapio.md). Supabase **permanece** Postgres + Auth + RLS; hospedagem Railway e rejeição de Vercel como default **não** são reabertas. O parágrafo seguinte preserva o contexto histórico da âncora.

A âncora veio da preferência do founder (já no plano Railway ~US$5 e intenção Supabase ~US$20) e deslocou o default da síntese (Vercel + Postgres genérico). Next roda bem na Railway; Auth/RLS/(historicamente Storage) no mesmo fornecedor do banco reduz peças. Trade-off: menos “zero-config” SSR/edge do ecossistema Vercel — aceito. A fatia Storage do Cardápio foi supersedida por [57](../decisoes/57-cloudflare-r2-imagens-cardapio.md) sem alterar Postgres/Auth/RLS.

**Considered:** Vercel + Neon/Supabase · tudo AWS.  
**Rejected:** assumir Vercel como default; Redis no dia 0.
