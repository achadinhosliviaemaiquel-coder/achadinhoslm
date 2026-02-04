import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
/* ========================================
   RETORNA O MENOR PREÇO REAL DO PRODUTO
======================================== */

export function getLowestPrice(product: {
  shopee_price?: number | string | null
  mercadolivre_price?: number | string | null
  amazon_price?: number | string | null
}): number | null {

  const prices = [
    product.shopee_price,
    product.mercadolivre_price,
    product.amazon_price,
  ]
    // converte qualquer coisa para número
    .map((p) => Number(p))
    // remove NaN, 0 e negativos
    .filter((p) => !isNaN(p) && p > 0)

  return prices.length ? Math.min(...prices) : null
}

/* ========================================
   FORMATA VALOR EM REAL
======================================== */

export function formatCurrency(value: number | null) {
  if (!value) return null

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

