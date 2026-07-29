import { createClient } from "@woovi/node-sdk";

import type {
  WooviChargeCreateResult,
  WooviPaymentAdapter,
} from "@foode/db";

export type WooviClientLike = {
  charge: {
    create: (
      data: { correlationID: string; value: number },
      params?: { return_existing?: "true" | "false" },
    ) => Promise<{
      charge: {
        brCode?: string;
        expiresDate?: string;
        globalID?: string;
        qrCodeImage?: string;
      };
    }>;
  };
  webhook: {
    handler: (config: {
      onChargeCompleted?: (payload: unknown) => Promise<void | Response> | void | Response;
      onChargeCreated?: (payload: unknown) => Promise<void | Response> | void | Response;
      onChargeExpired?: (payload: unknown) => Promise<void | Response> | void | Response;
    }) => {
      POST: (req: Request) => Promise<Response>;
    };
  };
};

export function createWooviSdkClient(appId: string): WooviClientLike {
  return createClient({ appId }) as unknown as WooviClientLike;
}

export function createWooviPaymentAdapter(
  client: WooviClientLike,
): WooviPaymentAdapter {
  return {
    async createCharge(input): Promise<WooviChargeCreateResult> {
      const response = await client.charge.create(
        {
          correlationID: input.correlationId,
          value: input.valueCents,
        },
        { return_existing: "true" },
      );
      const brCode = response.charge.brCode?.trim();
      const qrCodeImage = response.charge.qrCodeImage?.trim();
      if (!brCode || !qrCodeImage) {
        throw new Error("woovi_charge_missing_qr");
      }
      return {
        brCode,
        expiresAt: response.charge.expiresDate ?? null,
        providerChargeId: response.charge.globalID ?? null,
        qrCodeImage,
      };
    },
  };
}

export function createControlledWooviAdapter(
  impl: WooviPaymentAdapter["createCharge"],
): WooviPaymentAdapter {
  return { createCharge: impl };
}
