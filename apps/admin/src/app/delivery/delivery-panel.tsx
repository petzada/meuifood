import { OutlineContainer } from "@foode/ui";

import { SubmitButton } from "../team/submit-button";
import {
  createNeighborhood,
  deleteNeighborhood,
  setFeeMode,
  setPickupEnabled,
} from "./actions";

export type DeliveryNeighborhood = {
  feeCents: number;
  id: string;
  name: string;
  sortOrder: number;
};

export type StoreDeliveryConfig = {
  fixedDeliveryFeeCents: number | null;
  mode: "fixed" | "neighborhood" | null;
  neighborhoods: DeliveryNeighborhood[];
  pickupEnabled: boolean;
};

export type DeliveryFeedback =
  | "bairro-criado"
  | "bairro-duplicado"
  | "bairro-erro"
  | "bairro-removido"
  | "modo-erro"
  | "modo-salvo"
  | "retirada-ativada"
  | "retirada-desativada"
  | "retirada-erro";

export const deliveryFeedbackMessages: Record<DeliveryFeedback, string> = {
  "bairro-criado": "Bairro adicionado.",
  "bairro-duplicado": "Já existe um bairro equivalente nesta Loja.",
  "bairro-erro": "Não foi possível alterar o bairro.",
  "bairro-removido": "Bairro removido.",
  "modo-erro": "Não foi possível salvar o modo de taxa.",
  "modo-salvo": "Modo de taxa de Delivery atualizado.",
  "retirada-ativada": "Retirada ativada.",
  "retirada-desativada": "Retirada desativada.",
  "retirada-erro": "Não foi possível alterar a Retirada.",
};

function formatPrice(priceCents: number) {
  return (priceCents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
}

export function DeliveryPanel({
  delivery,
  feedback,
}: {
  delivery: StoreDeliveryConfig;
  feedback?: DeliveryFeedback;
}) {
  return (
    <section className="mx-auto mt-12 max-w-5xl" id="configuracoes">
      <OutlineContainer className="p-6 md:p-8">
        <h2 className="text-xl font-bold text-[var(--color-ink)]">
          Delivery e Retirada
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Escolha um único modo de taxa. Resíduos do modo anterior não afetam
          novos Pedidos.
        </p>

        {feedback ? (
          <p
            className="mt-4 rounded-xl border border-[var(--color-hairline)] px-4 py-3 text-sm font-bold text-[var(--color-body)]"
            role="status"
          >
            {deliveryFeedbackMessages[feedback]}
          </p>
        ) : null}

        <div className="mt-6 grid gap-6">
          <form action={setPickupEnabled} className="grid gap-3">
            <input
              name="pickupEnabled"
              type="hidden"
              value={delivery.pickupEnabled ? "false" : "true"}
            />
            <p className="text-sm font-bold text-[var(--color-ink)]">
              Retirada:{" "}
              <span className="text-[var(--color-primary-active)]">
                {delivery.pickupEnabled ? "ativa" : "desativada"}
              </span>
            </p>
            <SubmitButton>
              {delivery.pickupEnabled ? "Desativar Retirada" : "Ativar Retirada"}
            </SubmitButton>
          </form>

          <form action={setFeeMode} className="grid gap-3 border-t border-[var(--color-hairline-soft)] pt-6">
            <p className="text-sm font-bold text-[var(--color-ink)]">
              Modo de taxa de Delivery
            </p>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                defaultChecked={delivery.mode === "fixed"}
                name="mode"
                type="radio"
                value="fixed"
              />
              Taxa fixa
            </label>
            <label className="block text-sm font-bold text-[var(--color-ink)]">
              Valor fixo (R$)
              <input
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal"
                defaultValue={
                  delivery.fixedDeliveryFeeCents != null
                    ? (delivery.fixedDeliveryFeeCents / 100).toFixed(2)
                    : "0.00"
                }
                inputMode="decimal"
                name="fixedFeeReais"
                step="0.01"
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                defaultChecked={delivery.mode === "neighborhood"}
                name="mode"
                type="radio"
                value="neighborhood"
              />
              Taxa por bairro
            </label>
            <SubmitButton>Salvar modo</SubmitButton>
          </form>

          <div className="border-t border-[var(--color-hairline-soft)] pt-6">
            <p className="text-sm font-bold text-[var(--color-ink)]">Bairros</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Usados quando o modo por bairro está ativo. Duplicatas ambíguas
              (acento/caixa/espaço) são rejeitadas.
            </p>
            <ul className="mt-4 grid gap-2">
              {delivery.neighborhoods.length === 0 ? (
                <li className="text-sm text-[var(--color-muted)]">
                  Nenhum bairro cadastrado.
                </li>
              ) : (
                delivery.neighborhoods.map((neighborhood) => (
                  <li
                    className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[var(--color-hairline)] px-4"
                    key={neighborhood.id}
                  >
                    <span className="text-sm font-bold text-[var(--color-ink)]">
                      {neighborhood.name} · {formatPrice(neighborhood.feeCents)}
                    </span>
                    <form action={deleteNeighborhood}>
                      <input
                        name="neighborhoodId"
                        type="hidden"
                        value={neighborhood.id}
                      />
                      <button
                        className="text-sm font-bold text-[var(--color-error)]"
                        type="submit"
                      >
                        Remover
                      </button>
                    </form>
                  </li>
                ))
              )}
            </ul>

            <form action={createNeighborhood} className="mt-4 grid gap-3">
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Nome do bairro
                <input
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal"
                  name="name"
                  required
                />
              </label>
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Taxa (R$)
                <input
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal"
                  defaultValue="5.00"
                  inputMode="decimal"
                  name="feeReais"
                  required
                  step="0.01"
                />
              </label>
              <SubmitButton>Adicionar bairro</SubmitButton>
            </form>
          </div>
        </div>
      </OutlineContainer>
    </section>
  );
}
