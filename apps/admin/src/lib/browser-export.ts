// Exportação e impressão no navegador (Ticket 14, decisão 64): o CSV vem pronto da api e vira um
// download pelo DOM; "Imprimir" usa a impressão nativa com a classe `foode-print-report` no
// `<body>`, que o `@media print` do Painel lê para esconder a moldura (menu, status, rodapé).
// Sem PDF/XLSX no servidor. Só roda no cliente.

/** Baixa `content` como arquivo `filename` (Blob + `<a download>`). */
export function downloadTextFile(filename: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Depois do clique o navegador já leu o Blob; liberar na próxima volta do loop.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const PRINT_REPORT_CLASS = "foode-print-report";

/** Imprime a página só com o relatório (a moldura some pelo CSS enquanto a classe existe). */
export function printReport(): void {
  const { body } = document;
  body.classList.add(PRINT_REPORT_CLASS);
  // O `@page` global do Painel é o do cupom de 80 mm; o relatório imprime em página normal.
  const page = document.createElement("style");
  page.textContent = "@media print { @page { size: auto; margin: 12mm; } }";
  document.head.append(page);
  const cleanup = () => {
    body.classList.remove(PRINT_REPORT_CLASS);
    page.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Navegadores sem `afterprint` (ou impressão cancelada sem evento): limpa de qualquer jeito.
  setTimeout(cleanup, 1_000);
}
