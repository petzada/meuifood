// API pública de @foode/db. Não exporta o schema, o Drizzle nem o D1 cru: fora deste
// pacote só existem operações com contexto de Loja/Ops emitido pelo servidor (ADR 0006).
// A regra de lint em eslint.config.mjs impede acesso direto ao D1 nos apps.
export { ForgedContextError, type OpsContext, type StoreContext } from "./context";
export { cents, type Cents, utcNow } from "./conventions";
export {
  type AuditEvent,
  type AuditInput,
  createFoodeDb,
  type FoodeDb,
  FoodeDbError,
  type PublicStore,
  type StoreMember,
  type StoreSummary,
} from "./foode-db";
export {
  MEMBERSHIP_ROLES,
  type MembershipRole,
  PLATFORM_ROLES,
  type PlatformRole,
  STORE_STATUSES,
  type StoreStatus,
} from "./schema";
