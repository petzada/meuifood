// Botão flutuante de WhatsApp só no desktop (decisão 70), apontando para `/falar` (rota da
// outra fatia, que redireciona no servidor para o `wa.me` do secret). Sem número no HTML.
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";

import { FALAR_PATH } from "../../content/site";

export function WhatsAppFloat() {
  return (
    <a
      aria-label="Falar com a Foode no WhatsApp"
      className="mk-whats foode-button foode-button--primary px-4"
      href={FALAR_PATH}
    >
      <WhatsappLogo aria-hidden size={22} weight="fill" />
      WhatsApp
    </a>
  );
}
