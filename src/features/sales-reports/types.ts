export type ReportPeriod = "today" | "week" | "month" | "custom";

export type SalesReportPeriod = {
  period: ReportPeriod;
  from: string;
  to: string;
  start: Date;
  end: Date;
};

export type SalesReport = {
  kpis: {
    total_sold: string;
    sale_count: number;
    cash: string;
    yape: string;
    credit: string;
    gross_profit: string;
  };
  daily: Array<{
    business_date: string;
    sale_count: number;
    total_sold: string;
    gross_profit: string;
  }>;
};
