// Contrato do service binding admin → api (entrypoint `PainelApi`, RPC). O navegador do
// Painel nunca fala com a api: o servidor do admin chama estes métodos pelo binding `API`.
// Métodos de Loja entram com a sessão do Better Auth (Ticket 22).

export type ApiHealth = {
  status: "ok" | "degraded";
  service: "api";
  database: "ok" | "unavailable";
};

export interface PainelRpc {
  health(): Promise<ApiHealth>;
}
