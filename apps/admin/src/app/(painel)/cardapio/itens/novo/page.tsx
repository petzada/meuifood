import { redirect } from "next/navigation";

// Endereço antigo do "Novo item": o cadastro agora é um modal em etapas sobre o Cardápio
// (decisão 74). Mantido só para links já divulgados (checklist, favoritos).
export const dynamic = "force-dynamic";

export default async function NovoItemPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { categoria } = await searchParams;
  const query = new URLSearchParams({ ...(categoria ? { categoria } : {}), novo: "item" });
  redirect(`/cardapio?${query.toString()}`);
}
