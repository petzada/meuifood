// Máscara de dinheiro do Painel (feedback do Dono, item 10d): todo campo de R$ mostra
// "R$ 0,00" enquanto digita, em centavos (digitar 1, 2, 9, 0 → R$ 0,01 → R$ 0,12 → R$ 1,29 →
// R$ 12,90). Os parsers (`parseMoneyToCents`, `reaisToCents`) já aceitam o prefixo "R$" e o
// ponto de milhar, então o valor mascarado vai direto para a action.
//
// Um único listener de `input` em fase de captura no documento (instalado pelo `MoneyMaskRoot`)
// reescreve o valor de qualquer `<input data-money>` ANTES do React ler o evento: serve igual
// para campo não controlado (defaultValue) e controlado (onChange recebe o valor já mascarado).

/** Até R$ 9.999.999,99 (o contrato limita bem abaixo; evita número gigante colado). */
const MAX_DIGITS = 9;

function group(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ".");
}

/** Centavos → texto do campo: 1290 → "R$ 12,90". */
export function formatMoneyInput(cents: number): string {
  const safe = Math.max(0, Math.trunc(cents));
  const whole = Math.floor(safe / 100).toString();
  const fraction = String(safe % 100).padStart(2, "0");
  return `R$ ${group(whole)},${fraction}`;
}

/** Texto digitado → máscara em centavos; sem dígito = "" (campo opcional vazio continua vazio). */
export function maskMoneyInput(raw: string): string {
  const digits = raw
    .replace(/\D/gu, "")
    .replace(/^0+(?=\d)/u, "")
    .slice(0, MAX_DIGITS);
  if (!digits) return "";
  return formatMoneyInput(Number(digits));
}

/** Formato válido da máscara (o que a action recebe): "R$ 1.234,56" ou vazio. */
export function isMaskedMoney(value: string): boolean {
  return value === "" || /^R\$ \d{1,3}(?:\.\d{3})*,\d{2}$/u.test(value);
}

/** Instala a máscara no documento; devolve a função que desinstala. */
export function installMoneyMask(doc: Document): () => void {
  function onInput(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.hasAttribute("data-money")) return;
    const masked = maskMoneyInput(target.value);
    if (masked === target.value) return;
    // Setter nativo: `target.value = …` passaria pelo rastreador de valor do React, que então
    // acharia que nada mudou e não dispararia o onChange.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(target, masked);
    else target.value = masked;
    try {
      target.setSelectionRange(masked.length, masked.length);
    } catch {
      // Tipos de input sem seleção: ignora.
    }
  }
  doc.addEventListener("input", onInput, true);
  return () => doc.removeEventListener("input", onInput, true);
}
