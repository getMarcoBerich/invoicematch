export type MatchReason = {
  signal: string;
  weight: number;
  score: number;
  detail: string;
};

export type RecordRow = {
  matchId: string | null;
  matchStatus: "auto" | "manual" | "overridden" | "unmatched";
  confidence: number | null;
  matchReasons: MatchReason[] | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    client: string;
    baseAmount: number;
    vat: number;
    total: number;
  } | null;
  payment: {
    id: string;
    paymentDate: string;
    amount: number;
    client: string;
    description: string;
  } | null;
};
