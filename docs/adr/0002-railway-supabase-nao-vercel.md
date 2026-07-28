# Railway + Supabase (não Vercel)

Apps e cron na **Railway**; Postgres, Auth, RLS e Storage no **Supabase**. Vercel não é o host padrão do Foode.

A âncora veio da preferência do founder (já no plano Railway ~US$5 e intenção Supabase ~US$20) e deslocou o default da síntese (Vercel + Postgres genérico). Next roda bem na Railway; Auth/RLS/Storage no mesmo fornecedor do banco reduz peças. Trade-off: menos “zero-config” SSR/edge do ecossistema Vercel — aceito.

**Considered:** Vercel + Neon/Supabase · tudo AWS.  
**Rejected:** assumir Vercel como default; Redis no dia 0.
