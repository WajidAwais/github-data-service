export interface PullRequest {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
}

export interface Summary {
  /** Machine-readable month, e.g. "2021-09". */
  period: string;
  /** Human-readable month, e.g. "September 2021". */
  month: string;
  opened: number;
  closed: number;
}
