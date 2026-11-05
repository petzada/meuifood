// Sugestão de taxa de entrega por km (decisão 73). SÓ sugere: o checkout continua por bairro ou
// Taxa fixa (decisão 42), nunca cobra por km. A sugestão aparece como PLACEHOLDER do campo; o
// lojista confirma digitando. Puro (sem rede): a geocodificação fica em `lib/geocode.ts`.

export type LatLng = { lat: number; lng: number };

/** Fator de rota: a distância de rua é ~30% maior que a linha reta. */
export const ROUTE_FACTOR = 1.3;
/** Distância usada na Taxa fixa sugerida quando ainda não há bairro com distância. */
export const DEFAULT_FIXED_KM = 3;
/** Pedido mínimo sugerido = 3× a Taxa fixa sugerida. */
export const MINIMUM_ORDER_FACTOR = 3;

const EARTH_RADIUS_KM = 6371;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distância em linha reta (haversine), em km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distância estimada de entrega: linha reta × 1,3. */
export function routeKm(store: LatLng, neighborhood: LatLng): number {
  return haversineKm(store, neighborhood) * ROUTE_FACTOR;
}

/** Taxa sugerida em centavos para `km` a `centsPerKm`; 0 sem valor por km. */
export function suggestedFeeCents(km: number, centsPerKm: number | null): number {
  if (!centsPerKm || centsPerKm <= 0 || !Number.isFinite(km) || km <= 0) return 0;
  return Math.round(km * centsPerKm);
}

/** Taxa fixa sugerida: R$/km × distância média dos bairros com distância (ou 3 km). */
export function suggestedFixedFeeCents(
  distancesKm: readonly number[],
  centsPerKm: number | null,
): number {
  const known = distancesKm.filter((km) => Number.isFinite(km) && km > 0);
  const average =
    known.length > 0 ? known.reduce((sum, km) => sum + km, 0) / known.length : DEFAULT_FIXED_KM;
  return suggestedFeeCents(average, centsPerKm);
}

/** Pedido mínimo sugerido: 3× a Taxa fixa sugerida. */
export function suggestedMinimumOrderCents(fixedFeeCents: number): number {
  return Math.max(0, Math.round(fixedFeeCents * MINIMUM_ORDER_FACTOR));
}

/** Texto de busca do geocodificador para um bairro da cidade da Loja. */
export function neighborhoodQuery(
  neighborhood: string,
  city: { city: string; state: string },
): string | null {
  const name = neighborhood.trim();
  if (name.length < 2 || !city.city.trim()) return null;
  return `${name}, ${city.city.trim()} - ${city.state.trim()}, Brasil`;
}
