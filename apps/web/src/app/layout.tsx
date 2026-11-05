import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/nunito";
import "./globals.css";

import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "../content/site";

// Metadados raiz (PROPOSTA-SEO §2): `metadataBase` absoluto, template de título, OG padrão
// (`opengraph-image.tsx` gera a imagem 1200×630), Twitter card e robots. Páginas sobrescrevem
// `alternates.canonical` e `robots` (Storefront sem descrição+logo = noindex).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: SITE_NAME,
    url: "/",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
