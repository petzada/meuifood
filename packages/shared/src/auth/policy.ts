// Módulo único de política (achado 19.5). A api decide com ele no `requireRole`/guard; o admin
// usa o mesmo mapa só para esconder navegação (nunca como controle de acesso).
// Operador: Pedidos (ver, avançar, cancelar) e Pausa (decisão 63, P-OPE-4). Ops: só /ops.
// Dono: tudo da sua Loja. `store.settings` (horários, entrega, bandeiras, "Imprimir ao aceitar")
// continua só do Dono. `store.finance` (Ticket 14, NAV-01/NAV-02): Plano, Relatórios, Repasses e
// agregados — só do Dono; o Operador não vê dinheiro da Loja, e o Ops vê pelo `/ops`.
import type { Role } from "./schemas.js";
import type { Permission } from "./types.js";

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  foode_ops: ["ops.area"],
  owner: [
    "store.settings",
    "store.finance",
    "store.members",
    "store.menu",
    "store.pause",
    "orders.view",
    "orders.update_status",
    "orders.cancel",
  ],
  operator: ["store.pause", "orders.view", "orders.update_status", "orders.cancel"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
