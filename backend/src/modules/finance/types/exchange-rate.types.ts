export interface RateTableDto {
  base: string;
  rates: Record<string, number>;
  updatedAt: string;
  source: string;
  stale: boolean;
}

export interface ConversionResultDto {
  from: string;
  to: string;
  amount: number;
  result: number;
  rate: number;
  updatedAt: string;
  stale: boolean;
}
