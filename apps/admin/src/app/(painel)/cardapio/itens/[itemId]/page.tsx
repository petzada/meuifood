import { redirect } from "next/navigation";

// Endereço antigo da página do item: a edição agora é um modal com abas (Dados · Complementos ·
// Adicionais) sobre o Cardápio (decisão 74). Mantido só para links já divulgados.
export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  redirect(`/cardapio?item=${encodeURIComponent(itemId)}`);
}
