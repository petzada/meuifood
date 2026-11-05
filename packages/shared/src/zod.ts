// Re-export do Zod para a `api` (Ticket 26): os parsers dos provedores usam a MESMA versão do Zod
// dos contratos de `@foode/shared`, sem a `api` depender de `zod` diretamente (sem mexer no
// lockfile nem arriscar duas versões).
export { z } from "zod";
