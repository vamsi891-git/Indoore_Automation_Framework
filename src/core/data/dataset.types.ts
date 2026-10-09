export interface UserRecord {
  email: string;
  password: string;
  captcha: string;
  role: string;
}

export interface ChartCase {
  metric: string;
  element: string;
  toggleSeries: string;
  smoke?: boolean;
}

export interface ChartsFile {
  charts: ChartCase[];
}

export interface InvalidSchemaCase {
  name: string;
  schema: string;
  errorIncludes: string;
  payload: unknown;
}

export interface ExportPayload {
  resource: string;
  mode: string;
  filters: Record<string, string>;
  selectedIds?: number[];
  selectedCodes?: string[];
  columns?: string[];
}
