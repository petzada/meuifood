import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sem cache incremental por enquanto: o Storefront é dinâmico (Cardápio e Pedido vêm da
// api a cada request). Cache R2/D1 do Next entra quando houver página estática que valha.
export default defineCloudflareConfig({});
