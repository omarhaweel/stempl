const express = require("express");
const { z } = require("zod");
const { supabaseAdmin } = require("./supabase");
const { requireAuth } = require("./auth");
const { osloDayRange } = require("./oslo");

// Dagsplan: the admin sends a day plan (a message) to one or more employees for a date. A plan sent
// to several employees at once shares ONE comment thread (day_plan_threads). Sent plans are kept, so
// the admin can look back at them (historikk). The employees' work places are not part of the plan:
// they are the user's approved places (godkjente arbeidssteder).
const employeeRouter = express.Router();
const adminRouter = express.Router();

employeeRouter.use(requireAuth);
adminRouter.use(requireAuth, (req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Ingen tilgang" });
  next();
});

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ugyldig dato")
  .refine((d) => !Number.isNaN(Date.parse(d)), "Ugyldig dato");

const noteSchema = z.string().trim().min(1, "Skriv en melding").max(1000, "Maks 1000 tegn");

const planSchema = z.object({
  date: dateSchema,
  note: noteSchema,
  userIds: z.array(z.string().uuid()).min(1, "Velg minst én ansatt").max(200),
});

const commentSchema = z.object({
  body: z.string().trim().min(1, "Skriv en kommentar").max(1000, "Maks 1000 tegn"),
});

function validationError(res, issues) {
  const errors = {};
  for (const issue of issues) errors[issue.path.join(".") || "_"] ??= issue.message;
  return res.status(400).json({ error: "Ugyldig input", errors });
}

const wrap = (label, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    console.error(`${label}:`, e.message);
    if (!res.headersSent) res.status(500).json({ error: "Serverfeil. Prøv igjen senere." });
  }
};

const toPlan = (r, name, extra = {}) => ({
  id: r.id,
  threadId: r.thread_id,
  userId: r.user_id,
  employeeName: name,
  date: r.plan_date,
  note: r.note,
  read: !!r.read_at,
  createdAt: r.created_at,
  comments: [],
  ...extra,
});

const PLAN_COLUMNS = "id, thread_id, user_id, plan_date, note, read_at, created_at";

// ---- Usage -------------------------------------------------------------------

// Minutes the employees actually spent per place on a day, from their stemplinger.
// A shift counts for the place it was started at; shifts without a place count as "Annet".
async function usageByUser(userIds, date) {
  const byUser = new Map();
  if (userIds.length === 0) return byUser;
  const [start, end] = osloDayRange(date);
  const { data, error } = await supabaseAdmin
    .from("time_entries")
    .select("user_id, punched_in_at, punched_out_at, punched_in_place")
    .in("user_id", userIds)
    .lt("punched_in_at", end.toISOString())
    .or(`punched_out_at.gte.${start.toISOString()},punched_out_at.is.null`);
  if (error) throw error;
  const now = Date.now();
  for (const e of data) {
    const from = Math.max(new Date(e.punched_in_at).getTime(), start.getTime());
    const to = Math.min(e.punched_out_at ? new Date(e.punched_out_at).getTime() : now, end.getTime());
    if (to <= from) continue;
    const place = e.punched_in_place || "Annet";
    if (!byUser.has(e.user_id)) byUser.set(e.user_id, new Map());
    const m = byUser.get(e.user_id);
    m.set(place, (m.get(place) ?? 0) + Math.round((to - from) / 60000));
  }
  return byUser;
}

// ---- Threads and comments ---------------------------------------------------

// Delete threads that no plan uses any more (their comments go with them).
async function pruneThreads(companyId) {
  const [threads, used] = await Promise.all([
    supabaseAdmin.from("day_plan_threads").select("id").eq("company_id", companyId),
    supabaseAdmin.from("day_plans").select("thread_id").eq("company_id", companyId),
  ]);
  if (threads.error) throw threads.error;
  if (used.error) throw used.error;
  const inUse = new Set(used.data.map((p) => p.thread_id));
  const unused = threads.data.map((t) => t.id).filter((id) => !inUse.has(id));
  if (unused.length === 0) return;
  const { error } = await supabaseAdmin.from("day_plan_threads").delete().in("id", unused);
  if (error) throw error;
}

// The people a plan was sent together with, as a Map threadId -> [{ userId, name }].
async function threadMembers(threadIds) {
  const byThread = new Map();
  if (threadIds.length === 0) return byThread;
  const plans = await supabaseAdmin.from("day_plans").select("thread_id, user_id").in("thread_id", threadIds);
  if (plans.error) throw plans.error;
  const userIds = [...new Set(plans.data.map((p) => p.user_id))];
  const users = await supabaseAdmin.from("users").select("id, first_name, last_name").in("id", userIds);
  if (users.error) throw users.error;
  const names = new Map(users.data.map((u) => [u.id, `${u.first_name} ${u.last_name}`]));
  for (const p of plans.data) {
    if (!byThread.has(p.thread_id)) byThread.set(p.thread_id, []);
    byThread.get(p.thread_id).push({ userId: p.user_id, name: names.get(p.user_id) ?? "Ukjent" });
  }
  return byThread;
}

// Comment ids (among `commentIds`) the person has already read.
async function readSet(userId, commentIds) {
  if (commentIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from("day_plan_comment_reads")
    .select("comment_id")
    .eq("user_id", userId)
    .in("comment_id", commentIds);
  if (error) throw error;
  return new Set(data.map((r) => r.comment_id));
}

async function markRead(userId, commentIds) {
  if (commentIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from("day_plan_comment_reads")
    .upsert(commentIds.map((id) => ({ comment_id: id, user_id: userId })), { onConflict: "comment_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
}

// Comments for the given threads, oldest first, as a Map threadId -> comments.
// `mine` is true for the viewer's own comments; `read` says whether the viewer has opened it.
async function commentsByThread(threadIds, viewerId) {
  const byThread = new Map();
  if (threadIds.length === 0) return byThread;
  const { data, error } = await supabaseAdmin
    .from("day_plan_comments")
    .select("id, thread_id, user_id, from_admin, body, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const authorIds = [...new Set(data.map((c) => c.user_id))];
  const names = new Map();
  if (authorIds.length > 0) {
    const users = await supabaseAdmin.from("users").select("id, first_name, last_name").in("id", authorIds);
    if (users.error) throw users.error;
    for (const u of users.data) names.set(u.id, `${u.first_name} ${u.last_name}`);
  }
  const seen = await readSet(viewerId, data.map((c) => c.id));
  for (const c of data) {
    if (!byThread.has(c.thread_id)) byThread.set(c.thread_id, []);
    byThread.get(c.thread_id).push({
      id: c.id,
      mine: c.user_id === viewerId,
      fromAdmin: c.from_admin,
      authorName: names.get(c.user_id) ?? "Ukjent",
      body: c.body,
      read: c.user_id === viewerId || seen.has(c.id),
      createdAt: c.created_at,
    });
  }
  return byThread;
}

// ---- Employee --------------------------------------------------------------

// The employee's own plans from `from` (their local today) onwards, soonest first.
employeeRouter.get(
  "/dagsplan",
  wrap("my dagsplan", async (req, res) => {
    const from = dateSchema.safeParse(req.query.from);
    if (!from.success) return res.status(400).json({ error: "Ugyldig dato" });
    const { data, error } = await supabaseAdmin
      .from("day_plans")
      .select(PLAN_COLUMNS)
      .eq("user_id", req.user.id)
      .gte("plan_date", from.data)
      .order("plan_date", { ascending: true })
      .limit(60);
    if (error) throw error;
    const threadIds = [...new Set(data.map((r) => r.thread_id))];
    const [comments, members] = await Promise.all([commentsByThread(threadIds, req.user.id), threadMembers(threadIds)]);
    res.json({
      plans: data.map((r) =>
        toPlan(r, null, {
          comments: comments.get(r.thread_id) ?? [],
          // The colleagues the same plan was sent to: they write in the same comment thread.
          sharedWith: (members.get(r.thread_id) ?? []).filter((m) => m.userId !== req.user.id).map((m) => m.name),
        }),
      ),
    });
  }),
);

// Ids of the comments the employee has not read: written by someone else in the threads of their
// plans from `from` onwards (the administrator, or a colleague on the same plan).
async function unreadCommentIdsForEmployee(userId, from) {
  const plans = await supabaseAdmin
    .from("day_plans")
    .select("thread_id")
    .eq("user_id", userId)
    .gte("plan_date", from);
  if (plans.error) throw plans.error;
  const threadIds = [...new Set(plans.data.map((p) => p.thread_id))];
  if (threadIds.length === 0) return [];
  const comments = await supabaseAdmin
    .from("day_plan_comments")
    .select("id")
    .in("thread_id", threadIds)
    .neq("user_id", userId);
  if (comments.error) throw comments.error;
  const ids = comments.data.map((c) => c.id);
  const seen = await readSet(userId, ids);
  return ids.filter((id) => !seen.has(id));
}

// Number to show on the Dagsplan tab: unread plans plus unread comments in the plans' threads.
employeeRouter.get(
  "/dagsplan/unread",
  wrap("unread dagsplan", async (req, res) => {
    const from = dateSchema.safeParse(req.query.from);
    if (!from.success) return res.status(400).json({ error: "Ugyldig dato" });
    const plans = await supabaseAdmin
      .from("day_plans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", req.user.id)
      .gte("plan_date", from.data)
      .is("read_at", null);
    if (plans.error) throw plans.error;
    const unreadComments = await unreadCommentIdsForEmployee(req.user.id, from.data);
    res.json({ unread: (plans.count ?? 0) + unreadComments.length });
  }),
);

// The employee writes a comment on one of their own plans (everyone on the same plan sees it).
employeeRouter.post(
  "/dagsplan/:id/comments",
  wrap("comment dagsplan", async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = commentSchema.safeParse(req.body);
    if (!id.success) return res.status(400).json({ error: "Ugyldig id" });
    if (!body.success) return validationError(res, body.error.issues);
    const plan = await supabaseAdmin
      .from("day_plans")
      .select("id, company_id, thread_id")
      .eq("id", id.data)
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (plan.error) throw plan.error;
    if (!plan.data) return res.status(404).json({ error: "Fant ikke dagsplanen" });
    const { error } = await supabaseAdmin.from("day_plan_comments").insert({
      thread_id: plan.data.thread_id,
      company_id: plan.data.company_id,
      user_id: req.user.id,
      from_admin: false,
      body: body.data.body,
    });
    if (error) throw error;
    res.status(201).json({ ok: true });
  }),
);

// Marks the employee's plans from `from` onwards, and the comments in them, as read
// (called when they open the Dagsplan page).
employeeRouter.post(
  "/dagsplan/read",
  wrap("read dagsplan", async (req, res) => {
    const from = dateSchema.safeParse(req.body?.from);
    if (!from.success) return res.status(400).json({ error: "Ugyldig dato" });
    const { error } = await supabaseAdmin
      .from("day_plans")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", req.user.id)
      .gte("plan_date", from.data)
      .is("read_at", null);
    if (error) throw error;
    await markRead(req.user.id, await unreadCommentIdsForEmployee(req.user.id, from.data));
    res.json({ ok: true });
  }),
);

// ---- Admin -----------------------------------------------------------------

// The employees a dagsplan can be sent to.
adminRouter.get(
  "/dagsplan/options",
  wrap("dagsplan options", async (req, res) => {
    const users = await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name")
      .eq("company_id", req.user.company_id)
      .in("role", ["customer", "professional"])
      .eq("is_active", true)
      .order("first_name");
    if (users.error) throw users.error;
    res.json({ users: users.data.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}` })) });
  }),
);

// Plans sent for one date. Plans sent together share a threadId (and one comment thread).
adminRouter.get(
  "/dagsplan",
  wrap("list dagsplan", async (req, res) => {
    const date = dateSchema.safeParse(req.query.date);
    if (!date.success) return res.status(400).json({ error: "Ugyldig dato" });
    const [plans, users] = await Promise.all([
      supabaseAdmin
        .from("day_plans")
        .select(PLAN_COLUMNS)
        .eq("company_id", req.user.company_id)
        .eq("plan_date", date.data)
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("users").select("id, first_name, last_name").eq("company_id", req.user.company_id),
    ]);
    if (plans.error) throw plans.error;
    if (users.error) throw users.error;
    const names = new Map(users.data.map((u) => [u.id, `${u.first_name} ${u.last_name}`]));
    const threadIds = [...new Set(plans.data.map((r) => r.thread_id))];
    const [comments, usage] = await Promise.all([
      commentsByThread(threadIds, req.user.id),
      usageByUser([...new Set(plans.data.map((r) => r.user_id))], date.data),
    ]);
    res.json({
      plans: plans.data.map((r) =>
        toPlan(r, names.get(r.user_id) ?? "Ukjent", {
          comments: comments.get(r.thread_id) ?? [],
          // Time actually spent per place that day, most time first.
          usage: [...(usage.get(r.user_id) ?? new Map()).entries()]
            .map(([place, minutes]) => ({ place, minutes }))
            .filter((u) => u.minutes > 0)
            .sort((a, b) => b.minutes - a.minutes),
        }),
      ),
    });
  }),
);

// Historikk: all sent dagsplaner, newest date first. Plans sent together are one entry.
adminRouter.get(
  "/dagsplan/history",
  wrap("dagsplan history", async (req, res) => {
    const [plans, users] = await Promise.all([
      supabaseAdmin
        .from("day_plans")
        .select(PLAN_COLUMNS)
        .eq("company_id", req.user.company_id)
        .order("plan_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin.from("users").select("id, first_name, last_name").eq("company_id", req.user.company_id),
    ]);
    if (plans.error) throw plans.error;
    if (users.error) throw users.error;
    const names = new Map(users.data.map((u) => [u.id, `${u.first_name} ${u.last_name}`]));

    const threadIds = [...new Set(plans.data.map((p) => p.thread_id))];
    const counts = new Map();
    if (threadIds.length > 0) {
      const comments = await supabaseAdmin.from("day_plan_comments").select("thread_id").in("thread_id", threadIds);
      if (comments.error) throw comments.error;
      for (const c of comments.data) counts.set(c.thread_id, (counts.get(c.thread_id) ?? 0) + 1);
    }

    const entries = new Map(); // threadId -> entry (insertion order = newest first)
    for (const p of plans.data) {
      if (!entries.has(p.thread_id)) {
        entries.set(p.thread_id, {
          threadId: p.thread_id,
          date: p.plan_date,
          note: p.note,
          employees: [],
          commentCount: counts.get(p.thread_id) ?? 0,
        });
      }
      entries.get(p.thread_id).employees.push({ planId: p.id, name: names.get(p.user_id) ?? "Ukjent", read: !!p.read_at });
    }
    res.json({ entries: [...entries.values()] });
  }),
);

// Ids of the employees' comments in the company that this administrator has not read.
async function unreadEmployeeCommentIds(companyId, adminId, threadIds = null) {
  let q = supabaseAdmin
    .from("day_plan_comments")
    .select("id, thread_id")
    .eq("company_id", companyId)
    .eq("from_admin", false);
  if (threadIds) q = q.in("thread_id", threadIds);
  const { data, error } = await q;
  if (error) throw error;
  const seen = await readSet(adminId, data.map((c) => c.id));
  return data.filter((c) => !seen.has(c.id));
}

// Unread comments from employees in the company: the total (number on the Dagsplan tab)
// and which dates they are on, so the administrator can find them.
adminRouter.get(
  "/dagsplan/unread",
  wrap("unread comments", async (req, res) => {
    const unread = await unreadEmployeeCommentIds(req.user.company_id, req.user.id);
    const perThread = new Map();
    for (const c of unread) perThread.set(c.thread_id, (perThread.get(c.thread_id) ?? 0) + 1);

    const dates = new Map();
    if (perThread.size > 0) {
      const plans = await supabaseAdmin
        .from("day_plans")
        .select("thread_id, plan_date")
        .in("thread_id", [...perThread.keys()]);
      if (plans.error) throw plans.error;
      // A thread's plans all share one date.
      const dateOfThread = new Map(plans.data.map((p) => [p.thread_id, p.plan_date]));
      for (const [threadId, count] of perThread) {
        const d = dateOfThread.get(threadId);
        if (d) dates.set(d, (dates.get(d) ?? 0) + count);
      }
    }
    res.json({
      unread: unread.length,
      dates: [...dates.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    });
  }),
);

// The administrator opened a date: the employees' comments in that date's threads are read.
adminRouter.post(
  "/dagsplan/read",
  wrap("read comments", async (req, res) => {
    const date = dateSchema.safeParse(req.body?.date);
    if (!date.success) return res.status(400).json({ error: "Ugyldig dato" });
    const plans = await supabaseAdmin
      .from("day_plans")
      .select("thread_id")
      .eq("company_id", req.user.company_id)
      .eq("plan_date", date.data);
    if (plans.error) throw plans.error;
    const threadIds = [...new Set(plans.data.map((p) => p.thread_id))];
    if (threadIds.length > 0) {
      const unread = await unreadEmployeeCommentIds(req.user.company_id, req.user.id, threadIds);
      await markRead(req.user.id, unread.map((c) => c.id));
    }
    res.json({ ok: true });
  }),
);

// The administrator replies on a plan's thread (everyone the plan was sent to sees it).
adminRouter.post(
  "/dagsplan/:id/comments",
  wrap("reply dagsplan", async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = commentSchema.safeParse(req.body);
    if (!id.success) return res.status(400).json({ error: "Ugyldig id" });
    if (!body.success) return validationError(res, body.error.issues);
    const plan = await supabaseAdmin
      .from("day_plans")
      .select("id, thread_id")
      .eq("id", id.data)
      .eq("company_id", req.user.company_id)
      .maybeSingle();
    if (plan.error) throw plan.error;
    if (!plan.data) return res.status(404).json({ error: "Fant ikke dagsplanen" });
    const { error } = await supabaseAdmin.from("day_plan_comments").insert({
      thread_id: plan.data.thread_id,
      company_id: req.user.company_id,
      user_id: req.user.id,
      from_admin: true,
      body: body.data.body,
    });
    if (error) throw error;
    res.status(201).json({ ok: true });
  }),
);

// Send a plan (a message) to one or more employees for a date. They all share one comment thread.
// Sending again for the same employee and date replaces the earlier plan.
adminRouter.post(
  "/dagsplan",
  wrap("send dagsplan", async (req, res) => {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error.issues);
    const { date, note } = parsed.data;
    const userIds = [...new Set(parsed.data.userIds)];

    const users = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("company_id", req.user.company_id)
      .in("role", ["customer", "professional"])
      .in("id", userIds);
    if (users.error) throw users.error;
    if (users.data.length !== userIds.length) {
      return res.status(400).json({ error: "Ugyldig ansatt", errors: { userIds: "Ugyldig ansatt" } });
    }

    // One thread for everyone in this sending.
    const thread = await supabaseAdmin
      .from("day_plan_threads")
      .insert({ company_id: req.user.company_id })
      .select("id")
      .single();
    if (thread.error) throw thread.error;

    const { data, error } = await supabaseAdmin
      .from("day_plans")
      .upsert(
        userIds.map((userId) => ({
          company_id: req.user.company_id,
          user_id: userId,
          plan_date: date,
          thread_id: thread.data.id,
          note,
          read_at: null, // a new or replaced plan is unread again
          created_by: req.user.id,
        })),
        { onConflict: "user_id,plan_date" },
      )
      .select("id");
    if (error) throw error;
    await pruneThreads(req.user.company_id);
    res.status(201).json({ sent: data.length });
  }),
);

// Change the message of a sent plan. The employee gets it as unread again.
adminRouter.patch(
  "/dagsplan/:id",
  wrap("edit dagsplan", async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = z.object({ note: noteSchema }).safeParse(req.body);
    if (!id.success) return res.status(400).json({ error: "Ugyldig id" });
    if (!body.success) return validationError(res, body.error.issues);
    const { data, error } = await supabaseAdmin
      .from("day_plans")
      .update({ note: body.data.note, read_at: null })
      .eq("id", id.data)
      .eq("company_id", req.user.company_id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Fant ikke dagsplanen" });
    res.json({ ok: true });
  }),
);

// Delete a whole sending (all plans that were sent together) with its comments. Used from historikk.
adminRouter.delete(
  "/dagsplan/thread/:threadId",
  wrap("delete dagsplan thread", async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.threadId);
    if (!id.success) return res.status(400).json({ error: "Ugyldig id" });
    const { data, error } = await supabaseAdmin
      .from("day_plans")
      .delete()
      .eq("thread_id", id.data)
      .eq("company_id", req.user.company_id)
      .select("id");
    if (error) throw error;
    if (data.length === 0) return res.status(404).json({ error: "Fant ikke dagsplanen" });
    await pruneThreads(req.user.company_id);
    res.json({ deleted: data.length });
  }),
);

adminRouter.delete(
  "/dagsplan/:id",
  wrap("delete dagsplan", async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Ugyldig id" });
    const { data, error } = await supabaseAdmin
      .from("day_plans")
      .delete()
      .eq("id", id.data)
      .eq("company_id", req.user.company_id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Fant ikke dagsplanen" });
    // The thread stays as long as someone else is on the same plan.
    await pruneThreads(req.user.company_id);
    res.json({ ok: true });
  }),
);

module.exports = { employeeRouter, adminRouter };
