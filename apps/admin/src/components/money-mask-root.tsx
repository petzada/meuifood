"use client";

// Liga a máscara "R$ 0,00" em todo `<input data-money>` do Painel (lib/money-mask.ts).
import { useEffect } from "react";

import { installMoneyMask } from "../lib/money-mask";

export function MoneyMaskRoot() {
  useEffect(() => installMoneyMask(document), []);
  return null;
}
