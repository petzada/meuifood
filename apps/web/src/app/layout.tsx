import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/nunito";
import "./globals.css";

export const metadata: Metadata = {
  title: "Foode Delivery | Seu canal próprio",
  description:
    "Cardápio, pedidos e gestão para a sua loja vender direto pelo celular.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
