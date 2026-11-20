export type PlanComment = {
  id: string;
  /** Written by the person looking at it. */
  mine: boolean;
  fromAdmin: boolean;
  authorName: string;
  body: string;
  /** Has the other side opened it? */
  read: boolean;
  createdAt: string;
};

export type DayPlan = {
  id: string;
  /** Plans sent together share one comment thread. */
  threadId: string;
  /** Employee view: the colleagues this plan was sent to (they write in the same thread). */
  sharedWith?: string[];
  userId: string;
  /** Only set in the admin's list. */
  employeeName: string | null;
  /** åååå-mm-dd */
  date: string;
  note: string;
  /** Has the employee opened the plan? */
  read: boolean;
  comments: PlanComment[];
  /** Admin only: minutes actually spent per place that day. */
  usage?: { place: string; minutes: number }[];
};

export type PlanUser = {
  id: string;
  name: string;
};

/** One sent dagsplan in the historikk (plans sent together are one entry). */
export type HistoryEntry = {
  threadId: string;
  /** åååå-mm-dd */
  date: string;
  note: string;
  employees: { planId: string; name: string; read: boolean }[];
  commentCount: number;
};

/** åååå-mm-dd -> a Date at local midnight. */
export function isoToDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
