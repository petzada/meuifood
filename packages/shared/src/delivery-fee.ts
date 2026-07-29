import { normalizeNeighborhoodKey } from "./neighborhood.js";

export const deliveryFeeModeSchema = {
  fixed: "fixed",
  neighborhood: "neighborhood",
} as const;

export type DeliveryFeeMode = "fixed" | "neighborhood";

export type DeliveryNeighborhoodFee = {
  feeCents: number;
  name: string;
  normalizedName: string;
};

export type StoreDeliveryFeeConfig = {
  fixedDeliveryFeeCents: number | null;
  mode: DeliveryFeeMode | null;
  neighborhoods: DeliveryNeighborhoodFee[];
};

export type DeliveryAddressInput = {
  complement?: string | null;
  neighborhood: string;
  reference?: string | null;
  streetLine: string;
};

export type ResolvedDeliveryFee =
  | {
      feeCents: number;
      mode: DeliveryFeeMode;
      neighborhoodDisplay: string;
      ok: true;
    }
  | {
      error:
        | "delivery_not_configured"
        | "invalid_address"
        | "neighborhood_not_served";
      ok: false;
    };

function sanitizeOptionalText(value: string | null | undefined, max: number) {
  if (value == null) return null;
  const trimmed = value.trim().replace(/\s+/gu, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function sanitizeDeliveryAddress(input: {
  complement?: string | null;
  neighborhood?: string | null;
  reference?: string | null;
  streetLine?: string | null;
}):
  | {
      complement: string | null;
      neighborhood: string;
      ok: true;
      reference: string | null;
      streetLine: string;
    }
  | { ok: false; error: "invalid_address" } {
  const streetLine = (input.streetLine ?? "").trim().replace(/\s+/gu, " ");
  const neighborhood = (input.neighborhood ?? "").trim().replace(/\s+/gu, " ");
  if (
    streetLine.length < 1 ||
    streetLine.length > 200 ||
    neighborhood.length < 1 ||
    neighborhood.length > 120
  ) {
    return { ok: false, error: "invalid_address" };
  }
  return {
    complement: sanitizeOptionalText(input.complement, 120),
    neighborhood,
    ok: true,
    reference: sanitizeOptionalText(input.reference, 160),
    streetLine,
  };
}

/**
 * Autoridade da taxa de Delivery: ignora valores enviados pelo navegador.
 * Resíduos do modo inativo não afetam o resultado.
 */
export function resolveDeliveryFeeCents(
  config: StoreDeliveryFeeConfig,
  address: DeliveryAddressInput,
): ResolvedDeliveryFee {
  const sanitized = sanitizeDeliveryAddress(address);
  if (!sanitized.ok) return { ok: false, error: "invalid_address" };

  if (config.mode === "fixed") {
    if (
      config.fixedDeliveryFeeCents == null ||
      !Number.isInteger(config.fixedDeliveryFeeCents) ||
      config.fixedDeliveryFeeCents < 0
    ) {
      return { ok: false, error: "delivery_not_configured" };
    }
    return {
      feeCents: config.fixedDeliveryFeeCents,
      mode: "fixed",
      neighborhoodDisplay: sanitized.neighborhood,
      ok: true,
    };
  }

  if (config.mode === "neighborhood") {
    const key = normalizeNeighborhoodKey(sanitized.neighborhood);
    const match = config.neighborhoods.find(
      (entry) => entry.normalizedName === key,
    );
    if (!match) {
      return { ok: false, error: "neighborhood_not_served" };
    }
    return {
      feeCents: match.feeCents,
      mode: "neighborhood",
      neighborhoodDisplay: match.name,
      ok: true,
    };
  }

  return { ok: false, error: "delivery_not_configured" };
}

export function previewDeliveryFeeCents(
  config: StoreDeliveryFeeConfig,
  neighborhoodRaw: string,
): number | null {
  if (config.mode === "fixed") {
    return config.fixedDeliveryFeeCents;
  }
  if (config.mode === "neighborhood") {
    const key = normalizeNeighborhoodKey(neighborhoodRaw);
    const match = config.neighborhoods.find(
      (entry) => entry.normalizedName === key,
    );
    return match ? match.feeCents : null;
  }
  return null;
}
