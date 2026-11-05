// Entrypoint RPC do Painel. Exportado como classe nomeada do Worker: só um service
// binding com `"entrypoint": "PainelApi"` (o do admin) chega aqui; o fetch público não.
// Toda operação de Loja vai receber a sessão (Better Auth, Ticket 22), validar a
// membership em @foode/db e só então operar com o StoreContext emitido pelo pacote.
import { createFoodeDb } from "@foode/db";
import type { ApiHealth, PainelRpc } from "@foode/shared";
import { WorkerEntrypoint } from "cloudflare:workers";

import { apiHealth } from "./app";
import type { Env } from "./env";

export class PainelApi extends WorkerEntrypoint<Env> implements PainelRpc {
  async health(): Promise<ApiHealth> {
    return apiHealth(createFoodeDb(this.env.DB));
  }
}
