import { OutlineContainer } from "@foode/ui";

export type PublicStoreOperation = {
  checkout: {
    allowed: boolean;
    blockReason: "outside_hours" | "paused" | null;
  };
  nextOpeningAt: string | null;
  state: "open" | "outside_hours" | "paused";
  timezone: "America/Sao_Paulo";
};

function formatNextOpening(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: timezone,
    weekday: "long",
  }).format(new Date(value));
}

export function StoreOperationStatus({
  operation,
}: {
  operation: PublicStoreOperation;
}) {
  const content =
    operation.state === "open"
      ? {
          description: "A Loja está dentro do horário de funcionamento.",
          title: "Loja aberta",
        }
      : operation.state === "paused"
        ? {
            description:
              "O checkout está temporariamente bloqueado. O Cardápio continua disponível.",
            title: "Loja em Pausa",
          }
        : {
            description: operation.nextOpeningAt
              ? `Abre ${formatNextOpening(operation.nextOpeningAt, operation.timezone)}.`
              : "O checkout está bloqueado e não há próxima abertura calculável.",
            title: "Loja fora do horário",
          };

  return (
    <OutlineContainer
      as="section"
      className="mb-8 p-5"
      aria-live="polite"
    >
      <p className="text-sm font-bold text-[var(--color-primary-active)]">
        Funcionamento
      </p>
      <h2 className="mt-1 text-lg font-bold text-[var(--color-ink)]">
        {content.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
        {content.description}
      </p>
    </OutlineContainer>
  );
}
