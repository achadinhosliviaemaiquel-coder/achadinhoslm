export const AFFILIATE_RATES: Record<string, Record<string, number>> = {
  amazon: {
    alimentos: 0.13,
    suplementos: 0.13,
    beleza: 0.10,
    eletronicos: 0.05,
    default: 0.08,
  },
  mercadolivre: {
    eletronicos: 0.05,
    suplementos: 0.16,
    casa: 0.11,
    moda: 0.14,
    default: 0.10,
  },
  shopee: {
    default: 0.03,
  },
};
export function getCommissionRate(store: string, category: string): number {
  const storeRates = AFFILIATE_RATES[store];
  if (!storeRates) return 0;

  return storeRates[category] ?? storeRates.default ?? 0;
}
