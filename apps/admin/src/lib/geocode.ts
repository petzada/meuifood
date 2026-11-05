// Geocodificação gratuita do centro de um bairro (decisão 73) pelo OpenStreetMap Nominatim,
// chamada do NAVEGADOR do Painel, respeitando a política de uso
// (https://operations.osmfoundation.org/policies/nominatim/):
// - no máximo 1 requisição por segundo (fila única por aba);
// - identificação da aplicação: o navegador não deixa definir User-Agent, então vai o Referer da
//   página do Painel (política `strict-origin-when-cross-origin` manda só a origem
//   admin.foodedelivery.com.br) — é o que a política pede para apps no navegador;
// - cache em memória (mesma consulta não repete) e nenhuma consulta em massa/automática além do
//   que o lojista cadastra.
// Só nomes de bairro/cidade vão na consulta (nada de dado pessoal). Falha = null (silencioso).
import type { LatLng } from "./delivery-suggestion";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100;

type Fetcher = typeof fetch;

export function createGeocoder(
  fetcher: Fetcher = (...args) => fetch(...args),
  now = () => Date.now(),
) {
  const cache = new Map<string, Promise<LatLng | null>>();
  let chain: Promise<unknown> = Promise.resolve();
  let lastAt = 0;

  async function request(query: string): Promise<LatLng | null> {
    const wait = Math.max(0, lastAt + MIN_INTERVAL_MS - now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastAt = now();
    const url = `${ENDPOINT}?${new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      countrycodes: "br",
      "accept-language": "pt-BR",
    })}`;
    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    if (!response.ok) return null;
    const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = results[0];
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  return {
    /** Centro aproximado do lugar; null se não achou ou falhou. Serializa 1 req/s. */
    locate(query: string): Promise<LatLng | null> {
      const key = query.trim().toLowerCase();
      const cached = cache.get(key);
      if (cached) return cached;
      const result = chain.then(() => request(query)).catch(() => null);
      chain = result;
      cache.set(key, result);
      return result;
    },
  };
}

/** Um geocodificador por aba (fila e cache compartilhados pelas telas). */
let shared: ReturnType<typeof createGeocoder> | null = null;
export function geocoder() {
  shared ??= createGeocoder();
  return shared;
}
