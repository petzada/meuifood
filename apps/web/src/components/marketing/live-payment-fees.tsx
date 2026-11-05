"use client";

// Taxas da landing (decisão 70) lidas da tabela padrão vigente do `/ops`: a página é estática,
// então o navegador busca `/contato/taxas` (o `web` repassa a `GET /storefront/taxas` da api,
// com cache curto). Até chegar, ou se falhar, mostra o card "combinada no cadastro" — nada é
// inventado. A seção fica bem abaixo da dobra: a troca não conta para o CLS.
import { publicDefaultFeesResponseSchema } from "@foode/shared/ops";
import { useEffect, useState } from "react";

import { FEES_PATH } from "../../content/site";
import { PaymentFees, type PublicFee } from "./payment-fees";

export type LivePaymentFeesProps = {
  /** Transporte injetável nos testes; padrão `fetch` global. */
  load?: () => Promise<unknown>;
};

async function defaultLoad(): Promise<unknown> {
  const response = await fetch(FEES_PATH, { headers: { accept: "application/json" } });
  if (!response.ok) return null;
  return response.json();
}

export function LivePaymentFees({ load = defaultLoad }: LivePaymentFeesProps) {
  const [fees, setFees] = useState<readonly PublicFee[] | null>(null);

  useEffect(() => {
    let active = true;
    load()
      .then((body) => {
        const parsed = publicDefaultFeesResponseSchema.safeParse(body);
        if (active && parsed.success && parsed.data.fees.length > 0) setFees(parsed.data.fees);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [load]);

  return <PaymentFees fees={fees} />;
}
