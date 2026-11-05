"use client";

// Divulgação (`/configuracoes/divulgacao`, LNK-01, LNK-03): link só leitura + "Copiar link",
// QR Code com prévia e download PNG/SVG, "Abrir minha Loja" em nova aba e o Pixel (Meta e
// Google, opcionais, validação de formato inline).
import type { OwnerStoreSettings } from "@foode/shared/onboarding";
import { Button, OutlineContainer } from "@foode/ui";

import { CopyLinkButton } from "../../../../components/copy-link";
import { Field } from "../../../../components/form";
import { QrCode } from "../../../../components/qr-code";
import { SectionHeading } from "../../ops/_components/fields";
import { EditSection, type SettingsAction } from "./store-data-forms";

export function StoreLinkPanel({ slug, storeUrl }: { slug: string; storeUrl: string }) {
  return (
    <OutlineContainer as="section" aria-labelledby="link-title" className="p-5 md:p-7">
      <SectionHeading
        id="link-title"
        description="Divulgue nas redes, no WhatsApp e imprima o QR Code no balcão."
      >
        Link da Loja
      </SectionHeading>
      <div className="mt-5 grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <label className="block text-sm font-bold text-[var(--color-ink)]">
            Seu link
            <input
              className="mt-2 block min-h-12 w-full rounded-xl border border-[var(--color-hairline)] bg-transparent px-4 text-base text-[var(--color-ink)]"
              readOnly
              value={storeUrl}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <CopyLinkButton url={storeUrl} />
            <Button href={storeUrl} rel="noopener" target="_blank" variant="secondary">
              Abrir minha Loja
            </Button>
          </div>
          <p className="text-sm text-[var(--color-muted)]">
            Para trocar o link, use{" "}
            <a
              href="/configuracoes/loja#link"
              className="font-bold underline-offset-4 hover:underline"
            >
              Dados da Loja
            </a>
            . Seus links e QR antigos continuam funcionando.
          </p>
        </div>
        <QrCode slug={slug} url={storeUrl} />
      </div>
    </OutlineContainer>
  );
}

export function PixelSection({
  action,
  initial,
}: {
  action: SettingsAction;
  initial: Pick<OwnerStoreSettings, "metaPixelId" | "googleTagId">;
}) {
  return (
    <EditSection
      action={action}
      description={
        <>
          Opcional. O funil da Foode é próprio e já mede visitas, itens, carrinho e Pedidos; o Pixel
          apoia as suas campanhas no Meta e no Google. Eventos enviados: ver item, adicionar ao
          carrinho e compra (só valor e moeda, sem dados do cliente).
        </>
      }
      id="pixel"
      title="Pixel Meta e Google"
    >
      {({ errors, onChange }) => (
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            id="metaPixelId"
            name="metaPixelId"
            label="ID do Pixel da Meta (opcional)"
            defaultValue={initial.metaPixelId ?? ""}
            inputMode="numeric"
            autoComplete="off"
            placeholder="123456789012345"
            hint="15 ou 16 números, em Gerenciador de Eventos."
            error={errors.metaPixelId}
            onChange={onChange}
          />
          <Field
            id="googleTagId"
            name="googleTagId"
            label="ID da tag do Google (opcional)"
            defaultValue={initial.googleTagId ?? ""}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="G-XXXXXXXXXX"
            hint="Formato G-XXXXXXX (GA4) ou AW-XXXXXXX (Google Ads)."
            error={errors.googleTagId}
            onChange={onChange}
          />
        </div>
      )}
    </EditSection>
  );
}
