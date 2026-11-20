const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { supabaseAdmin } = require("./supabase");
const { requireAuth, registerSchema, toPublic, PUBLIC_COLUMNS, BCRYPT_ROUNDS } = require("./auth");
const { rememberPlaces, placeHistory } = require("./places");

const router = express.Router();

// Role is read from the database by requireAuth, never from the token.
router.use(requireAuth, (req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Ingen tilgang" });
  next();
});

const DEFAULT_HISTORY_DAYS = 93;
const ENTRY_COLUMNS = "id, punched_in_at, punched_out_at, note, edited_at, punched_in_place, punched_out_place";
const ADJ_COLUMNS = "id, adjust_date, minutes, note, created_at";

const idSchema = z.string().uuid();
const isoDateTime = z.iso.datetime({ offset: true });
const emptyToNull = (s) => (s === "" ? null : s);

const profileSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ugyldig e-postadresse").max(254),
  firstName: z.string().trim().min(1, "Påkrevd").max(50, "Maks 50 tegn"),
  lastName: z.string().trim().min(1, "Påkrevd").max(50, "Maks 50 tegn"),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9 ()-]{7,20})?$/, "Ugyldig telefonnummer")
    .nullish()
    .transform((v) => (v ? v : null)),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Bruk formatet ÅÅÅÅ-MM-DD")
    .refine((d) => d === "" || (!Number.isNaN(Date.parse(d)) && new Date(d) < new Date()), "Ugyldig dato")
    .nullish()
    .transform((v) => (v ? v : null)),
});

const entrySchema = z
  .object({
    punchedInAt: isoDateTime,
    punchedOutAt: isoDateTime.nullish().transform((v) => v ?? null),
    note: z.string().trim().max(500, "Maks 500 tegn").nullish().transform((v) => emptyToNull(v ?? null)),
    confirmMerge: z.boolean().optional(),
  })
  .refine((v) => !v.punchedOutAt || new Date(v.punchedOutAt) >= new Date(v.punchedInAt), {
    message: "Ut-tid må være etter inn-tid",
    path: ["punchedOutAt"],
  });

const adjustmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ugyldig dato"),
  minutes: z
    .number()
    .int()
    .refine((m) => m !== 0 && Math.abs(m) <= 44640, "Ugyldig tid"),
  note: z.string().trim().max(500, "Maks 500 tegn").nullish().transform((v) => emptyToNull(v ?? null)),
});

const toEntry = (r) => ({
  id: r.id,
  punchedInAt: r.punched_in_at,
  punchedOutAt: r.punched_out_at,
  note: r.note,
  editedAt: r.edited_at,
  punchedInPlace: r.punched_in_place,
  punchedOutPlace: r.punched_out_place,
});
const toAdjustment = (r) => ({
  id: r.id,
  date: r.adjust_date,
  minutes: r.minutes,
  note: r.note,
  createdAt: r.created_at,
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

const parseId = (res, value) => {
  const r = idSchema.safeParse(value);
  if (!r.success) res.status(400).json({ error: "Ugyldig id" });
  return r.success ? r.data : null;
};

// True if the user belongs to the logged-in admin's company.
async function inMyCompany(req, userId) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("company_id", req.user.company_id)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// Loads the target user. Responds and returns null if missing, or (when
// `editable`) if the target is an admin: admins can't be modified here.
async function loadUser(req, res, { editable = false } = {}) {
  const id = parseId(res, req.params.id);
  if (!id) return null;
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(`${PUBLIC_COLUMNS}, is_active`)
    .eq("id", id)
    .eq("company_id", req.user.company_id) // admins only reach users in their own company
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    res.status(404).json({ error: "Fant ikke brukeren" });
    return null;
  }
  if (editable && data.role === "admin") {
    res.status(403).json({ error: "Administratorer kan ikke endres her" });
    return null;
  }
  return data;
}

// Loads an entry and its owner; blocks edits to admins' entries.
async function loadEntry(req, res) {
  const id = parseId(res, req.params.entryId);
  if (!id) return null;
  const { data, error } = await supabaseAdmin
    .from("time_entries")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    res.status(404).json({ error: "Fant ikke stemplingen" });
    return null;
  }
  const owner = await supabaseAdmin
    .from("users")
    .select("role, company_id")
    .eq("id", data.user_id)
    .maybeSingle();
  if (owner.error) throw owner.error;
  if (!owner.data || owner.data.company_id !== req.user.company_id) {
    res.status(404).json({ error: "Fant ikke stemplingen" });
    return null;
  }
  if (owner.data.role === "admin") {
    res.status(403).json({ error: "Administratorer kan ikke endres her" });
    return null;
  }
  return data;
}

function dbError(res, error, fallback) {
  if (error.code === "23505") {
    return res.status(409).json({ error: fallback ?? "Finnes allerede" });
  }
  if (error.code === "23514") return res.status(400).json({ error: "Ugyldig tid" });
  throw error;
}

const withStatus = (u, activeSince, workplaces = []) => ({
  ...toPublic(u),
  isActive: u.is_active,
  activeSince: activeSince ?? null,
  workplaces,
});

// The names of each user's approved work places (godkjente arbeidssteder). Returns a Map userId -> [name].
async function workplaceNames(userIds) {
  const byUser = new Map();
  if (userIds.length === 0) return byUser;
  const { data, error } = await supabaseAdmin
    .from("approved_locations")
    .select("user_id, name")
    .in("user_id", userIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  for (const p of data) {
    if (!byUser.has(p.user_id)) byUser.set(p.user_id, []);
    byUser.get(p.user_id).push(p.name);
  }
  return byUser;
}

// ---- Users -----------------------------------------------------------------

router.get(
  "/users",
  wrap("admin list users", async (req, res) => {
    const users = await supabaseAdmin
      .from("users")
      .select(`${PUBLIC_COLUMNS}, is_active`)
      .eq("company_id", req.user.company_id)
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });
    if (users.error) throw users.error;
    const open = await supabaseAdmin
      .from("time_entries")
      .select("user_id, punched_in_at")
      .is("punched_out_at", null)
      .in("user_id", users.data.map((u) => u.id));
    if (open.error) throw open.error;
    const activeMap = new Map(open.data.map((o) => [o.user_id, o.punched_in_at]));
    const places = await workplaceNames(users.data.map((u) => u.id));
    res.json({ users: users.data.map((u) => withStatus(u, activeMap.get(u.id), places.get(u.id))) });
  }),
);

router.post(
  "/users",
  wrap("admin create user", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error.issues);
    const { email, password, firstName, lastName, phone, dateOfBirth, role } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        first_name: firstName,
        last_name: lastName,
        phone: phone ?? null,
        date_of_birth: dateOfBirth ?? null,
        role,
        company_id: req.user.company_id,
      })
      .select(`${PUBLIC_COLUMNS}, is_active`)
      .single();
    if (error) return dbError(res, error, "Det finnes allerede en konto med denne e-posten");
    res.status(201).json({ user: withStatus(data) });
  }),
);

router.get(
  "/users/:id",
  wrap("admin get user", async (req, res) => {
    const user = await loadUser(req, res);
    if (!user) return;

    const fromParam = typeof req.query.from === "string" ? req.query.from : null;
    const from =
      fromParam && !Number.isNaN(Date.parse(fromParam))
        ? new Date(fromParam)
        : new Date(Date.now() - DEFAULT_HISTORY_DAYS * 86400000);

    const [entries, adjustments] = await Promise.all([
      supabaseAdmin
        .from("time_entries")
        .select(ENTRY_COLUMNS)
        .eq("user_id", user.id)
        .gte("punched_in_at", from.toISOString())
        .order("punched_in_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("time_adjustments")
        .select(ADJ_COLUMNS)
        .eq("user_id", user.id)
        .gte("adjust_date", from.toISOString().slice(0, 10))
        .order("adjust_date", { ascending: false })
        .limit(200),
    ]);
    if (entries.error) throw entries.error;
    if (adjustments.error) throw adjustments.error;

    const list = entries.data.map(toEntry);
    const places = await workplaceNames([user.id]);
    res.json({
      serverTime: new Date().toISOString(),
      user: withStatus(user, list.find((e) => !e.punchedOutAt)?.punchedInAt, places.get(user.id)),
      entries: list,
      adjustments: adjustments.data.map(toAdjustment),
    });
  }),
);

// Profile only: role and password can't be changed from here.
router.patch(
  "/users/:id",
  wrap("admin edit user", async (req, res) => {
    const user = await loadUser(req, res, { editable: true });
    if (!user) return;
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error.issues);
    const { email, firstName, lastName, phone, dateOfBirth } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("users")
      .update({ email, first_name: firstName, last_name: lastName, phone, date_of_birth: dateOfBirth })
      .eq("id", user.id)
      .select(`${PUBLIC_COLUMNS}, is_active`)
      .single();
    if (error) return dbError(res, error, "Det finnes allerede en konto med denne e-posten");
    res.json({ user: withStatus(data) });
  }),
);

router.delete(
  "/users/:id",
  wrap("admin delete user", async (req, res) => {
    const user = await loadUser(req, res, { editable: true });
    if (!user) return;
    const { error } = await supabaseAdmin.from("users").delete().eq("id", user.id);
    if (error) throw error;
    res.json({ ok: true });
  }),
);

// ---- Stemplings --------------------------------------------------------------

// ---- Overlap handling --------------------------------------------------------
// A stempling that overlaps others is allowed, but only after the admin has been
// warned (409 + the list). With confirmMerge the overlapping ones are merged into
// the edited stempling, so time is never counted twice.

const toMs = (s) => (s ? new Date(s).getTime() : Infinity);
const toIso = (ms) => (ms === Infinity ? null : new Date(ms).toISOString());

// All of the user's stemplinger that overlap [start, end), growing the range as
// merged ones reach further (so chains of overlaps are all found).
async function findOverlaps(userId, start, end, excludeId) {
  let lo = toMs(start);
  let hi = toMs(end);
  const found = new Map();
  for (let i = 0; i < 20; i++) {
    let q = supabaseAdmin.from("time_entries").select(ENTRY_COLUMNS).eq("user_id", userId);
    if (excludeId) q = q.neq("id", excludeId);
    if (hi !== Infinity) q = q.lt("punched_in_at", new Date(hi).toISOString());
    q = q.or(`punched_out_at.is.null,punched_out_at.gt.${new Date(lo).toISOString()}`);
    const { data, error } = await q;
    if (error) throw error;
    let grew = false;
    for (const r of data) {
      if (found.has(r.id)) continue;
      found.set(r.id, r);
      grew = true;
      lo = Math.min(lo, toMs(r.punched_in_at));
      hi = Math.max(hi, toMs(r.punched_out_at));
    }
    if (!grew) break;
  }
  return { overlaps: [...found.values()], lo, hi };
}

// Adds (entryId null) or edits a stempling, merging overlaps when confirmed.
async function saveEntry(req, res, userId, entryId) {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);
  const { punchedInAt, punchedOutAt, note, confirmMerge } = parsed.data;

  const { overlaps, lo, hi } = await findOverlaps(userId, punchedInAt, punchedOutAt, entryId);
  if (overlaps.length && !confirmMerge) {
    return res.status(409).json({
      error: "Stemplingen overlapper andre stemplinger",
      code: "overlap",
      overlaps: overlaps.map(toEntry),
      merged: { punchedInAt: toIso(lo), punchedOutAt: toIso(hi) },
    });
  }

  const values = {
    punched_in_at: overlaps.length ? toIso(lo) : punchedInAt,
    punched_out_at: overlaps.length ? toIso(hi) : punchedOutAt,
    note: overlaps.length
      ? ([...new Set([note, ...overlaps.map((o) => o.note)].filter(Boolean))].join(" · ").slice(0, 500) || null)
      : note,
    edited_by: req.user.id,
    edited_at: new Date().toISOString(),
  };
  if (overlaps.length) {
    const earliest = overlaps.find((r) => toMs(r.punched_in_at) === lo);
    const latest = overlaps.find((r) => toMs(r.punched_out_at) === hi);
    if (earliest) values.punched_in_place = earliest.punched_in_place;
    if (latest) values.punched_out_place = latest.punched_out_place;
  }

  const removeOverlaps = async () => {
    if (!overlaps.length) return;
    const { error } = await supabaseAdmin
      .from("time_entries")
      .delete()
      .in("id", overlaps.map((o) => o.id));
    if (error) throw error;
  };
  // Only one open shift per user is allowed, so clear the old ones first when the result is open.
  if (hi === Infinity) await removeOverlaps();

  const query = entryId
    ? supabaseAdmin.from("time_entries").update(values).eq("id", entryId)
    : supabaseAdmin.from("time_entries").insert({ ...values, user_id: userId });
  const { data, error } = await query.select(ENTRY_COLUMNS).single();
  if (error) return dbError(res, error, "Brukeren har allerede en aktiv stempling");

  if (hi !== Infinity) await removeOverlaps();
  res.status(entryId ? 200 : 201).json({ entry: toEntry(data), mergedCount: overlaps.length });
}

router.post(
  "/users/:id/entries",
  wrap("admin add entry", async (req, res) => {
    const user = await loadUser(req, res, { editable: true });
    if (!user) return;
    await saveEntry(req, res, user.id, null);
  }),
);

router.patch(
  "/entries/:entryId",
  wrap("admin edit entry", async (req, res) => {
    const entry = await loadEntry(req, res);
    if (!entry) return;
    await saveEntry(req, res, entry.user_id, entry.id);
  }),
);

router.delete(
  "/entries/:entryId",
  wrap("admin delete entry", async (req, res) => {
    const entry = await loadEntry(req, res);
    if (!entry) return;
    const { error } = await supabaseAdmin.from("time_entries").delete().eq("id", entry.id);
    if (error) throw error;
    res.json({ ok: true });
  }),
);

// ---- Total time corrections ------------------------------------------------

// Totals are the sum of the stemplinger; admins can no longer add manual corrections.

router.delete(
  "/adjustments/:adjId",
  wrap("admin delete adjustment", async (req, res) => {
    const id = parseId(res, req.params.adjId);
    if (!id) return;
    const adj = await supabaseAdmin.from("time_adjustments").select("user_id").eq("id", id).maybeSingle();
    if (adj.error) throw adj.error;
    if (!adj.data || !(await inMyCompany(req, adj.data.user_id))) {
      return res.status(404).json({ error: "Fant ikke justeringen" });
    }
    const { error } = await supabaseAdmin.from("time_adjustments").delete().eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  }),
);

// ---- Approved work places (godkjente arbeidssteder) --------------------------

const LOCATION_COLUMNS = "id, name, latitude, longitude, radius_m, created_at";
const MAX_LOCATIONS_PER_USER = 20;
const PLACE_RADIUS_M = 200;

const locationSchema = z.object({
  name: z.string().trim().min(1, "Påkrevd").max(200, "Maks 200 tegn"),
  latitude: z.number().min(-90, "Ugyldig posisjon").max(90, "Ugyldig posisjon"),
  longitude: z.number().min(-180, "Ugyldig posisjon").max(180, "Ugyldig posisjon"),
});

const toLocation = (r) => ({
  id: r.id,
  name: r.name,
  latitude: r.latitude,
  longitude: r.longitude,
  radiusM: r.radius_m,
  createdAt: r.created_at,
});

// A user with approved places may punch in/out only within PLACE_RADIUS_M of one of them.
router.get(
  "/users/:id/locations",
  wrap("admin list locations", async (req, res) => {
    const user = await loadUser(req, res);
    if (!user) return;
    const { data, error } = await supabaseAdmin
      .from("approved_locations")
      .select(LOCATION_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.json({
      user: { id: user.id, firstName: user.first_name, lastName: user.last_name, role: user.role },
      locations: data.map(toLocation),
    });
  }),
);

router.post(
  "/users/:id/locations",
  wrap("admin add location", async (req, res) => {
    const user = await loadUser(req, res, { editable: true });
    if (!user) return;
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error.issues);

    const count = await supabaseAdmin
      .from("approved_locations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (count.error) throw count.error;
    if (count.count >= MAX_LOCATIONS_PER_USER) {
      return res.status(400).json({ error: `Maks ${MAX_LOCATIONS_PER_USER} godkjente arbeidssteder per bruker` });
    }

    const { data, error } = await supabaseAdmin
      .from("approved_locations")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        radius_m: PLACE_RADIUS_M,
        created_by: req.user.id,
      })
      .select(LOCATION_COLUMNS)
      .single();
    if (error) throw error;
    // Remember it in the company's place history, so it can be picked again for another user.
    await rememberPlaces(req.user.company_id, [parsed.data]);
    res.status(201).json({ location: toLocation(data) });
  }),
);

router.delete(
  "/locations/:locId",
  wrap("admin delete location", async (req, res) => {
    const id = parseId(res, req.params.locId);
    if (!id) return;
    const loc = await supabaseAdmin.from("approved_locations").select("user_id").eq("id", id).maybeSingle();
    if (loc.error) throw loc.error;
    if (!loc.data || !(await inMyCompany(req, loc.data.user_id))) {
      return res.status(404).json({ error: "Fant ikke stedet" });
    }
    const { error } = await supabaseAdmin.from("approved_locations").delete().eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  }),
);

// Places the company has used before (most recent first): pick one again with a single tap.
router.get(
  "/place-history",
  wrap("admin place history", async (req, res) => {
    res.json({ places: await placeHistory(req.user.company_id) });
  }),
);

module.exports = router;
