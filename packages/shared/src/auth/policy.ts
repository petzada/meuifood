// Módulo único de política (achado 19.5). A api decide com ele no `requireRole`/guard; o admin
// usa o mesmo mapa só para esconder navegação (nunca como controle de acesso).
// Operador: só Pedidos/status. Ops: só /ops. Dono: tudo da sua Loja.
import type { Role } from "./schemas.js";
import type { Permission } from "./types.js";

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  foode_ops: ["ops.area"],
  owner: ["store.settings", "store.members", "store.menu", "orders.view", "orders.update_status"],
  operator: ["orders.view", "orders.update_status"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
