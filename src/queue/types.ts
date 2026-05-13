export interface QueueItem {
  id: string;
  action: string;
  params: Record<string, unknown>;
  minDelay: number;
  maxDelay: number;
  status: "pending" | "processing" | "completed" | "failed";
  result?: unknown;
  error?: string;
  enqueuedAt: number;
  executedAt?: number;
  completedAt?: number;
}

export const WRITE_ACTIONS = [
  "create_post",
  "reply",
  "edit_content",
  "delete_content",
  "vote",
  "save_item",
  "unsave_item",
  "subscribe_subreddit",
  "unsubscribe_subreddit",
  "mark_inbox_read",
] as const;

export type WriteAction = (typeof WRITE_ACTIONS)[number];
