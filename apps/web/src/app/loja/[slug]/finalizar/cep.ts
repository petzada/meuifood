// CEP opcional (P-3.1): ViaCEP, depois BrasilAPI, chamados do navegador; qualquer falha é
// silenciosa (o Consumidor segue digitando). Só rua e bairro interessam; o bairro continua
// escolhido da lista da Loja.
import type { FetchLike } from "./checkout-api";

export type CepResult = { neighborhood: string | null; street: string | null };

const PROVIDERS: Array<{
  parse: (payload: unknown) => CepResult | null;
  url: (cep: string) => string;
}> = [
  {
    parse: (payload) => {
      const data = payload as { bairro?: unknown; erro?: unknown; logradouro?: unknown };
      if (!data || data.erro) return null;
      return {
        neighborhood: typeof data.bairro === "string" ? data.bairro : null,
        street: typeof data.logradouro === "string" ? data.logradouro : null,
      };
    },
    url: (cep) => `https://viacep.com.br/ws/${cep}/json/`,
  },
  {
    parse: (payload) => {
      const data = payload as { neighborhood?: unknown; street?: unknown };
      if (!data) return null;
      return {
        neighborhood: typeof data.neighborhood === "string" ? data.neighborhood : null,
        street: typeof data.street === "string" ? data.street : null,
      };
    },
    url: (cep) => `https://brasilapi.com.br/api/cep/v1/${cep}`,
  },
];

export async function lookupCep(
  cepDigits: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<CepResult | null> {
  if (!/^\d{8}$/u.test(cepDigits)) return null;
  for (const provider of PROVIDERS) {
    try {
      const response = await fetchImpl(provider.url(cepDigits), {
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) continue;
      const result = provider.parse(await response.json());
      if (result && (result.street || result.neighborhood)) return result;
    } catch {
      // próximo provedor
    }
  }
  return null;
}
