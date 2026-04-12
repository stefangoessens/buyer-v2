export function greet(name: string): string {
  return `Hello, ${name}! Welcome to buyer-v2.`;
}

export function calculateSavings(homePrice: number, commissionRate: number): number {
  if (homePrice <= 0) return 0;
  const standardCommission = homePrice * commissionRate;
  const ourFee = homePrice * 0.01;
  return standardCommission - ourFee;
}
