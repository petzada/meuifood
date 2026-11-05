import { OutlineContainer } from "@foode/ui";
import Link from "next/link";

import { requirePermission } from "../../../lib/session";
import { SETTINGS_SECTIONS, SettingsHeader } from "./_components/settings-nav";

// Lista de seções das Configurações (NAV-05, T-07). Só o Dono (`store.settings`).
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  await requirePermission("store.settings");
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <SettingsHeader />
      <ul className="grid gap-4 sm:grid-cols-2">
        {SETTINGS_SECTIONS.map((item) => (
          <li key={item.href}>
            <OutlineContainer className="h-full p-5">
              <Link
                href={item.href}
                className="text-lg font-bold text-[var(--color-ink)] underline-offset-4 hover:underline"
              >
                {item.label}
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-body)]">
                {item.description}
              </p>
            </OutlineContainer>
          </li>
        ))}
      </ul>
    </section>
  );
}
