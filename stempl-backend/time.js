const express = require("express");
const { z } = require("zod");
const { supabaseAdmin } = require("./supabase");
const { requireAuth } = require("./auth");
const { checkGeofence, approvedPlaces } = require("./geo");

const router = express.Router();
router.use(requireAuth);

const COLUMNS = "id, punched_in_at, punched_out_at, note, punched_in_place, punched_out_place";
const HISTORY_DAYS = 35;

const toEntry = (r) => ({
  id: r.id,
  punchedInAt: r.punched_in_at,
  punchedOutAt: r.punched_out_at,
  note: r.note,
  punchedInPlace: r.punched_in_place,
  punchedOutPlace: r.punched_out_place,
});

const noteSchema = z.object({
  note: z.string().trim().max(500, "Maks 500 tegn").optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

function serverError(res, label, e) {
  console.error(`${label}:`, e.message);
  res.status(500).json({ error: "Serverfeil. Prøv igjen senere." });
}

// Current open shift (or null) + recent history, newest first.
router.get("/", async (req, res) => {
  try {
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
    const [entriesRes, adjRes, places] = await Promise.all([
      supabaseAdmin
        .from("time_entries")
        .select(COLUMNS)
        .eq("user_id", req.user.id)
        .gte("punched_in_at", since)
        .order("punched_in_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("time_adjustments")
        .select("id, adjust_date, minutes, note")
        .eq("user_id", req.user.id)
        .gte("adjust_date", since.slice(0, 10)),
      approvedPlaces(req.user.id),
    ]);
    if (entriesRes.error) throw entriesRes.error;
    if (adjRes.error) throw adjRes.error;

    const entries = entriesRes.data.map(toEntry);
    res.json({
      serverTime: new Date().toISOString(),
      active: entries.find((e) => !e.punchedOutAt) ?? null,
      entries,
      // The user's approved work places (godkjente arbeidssteder).
      locations: places.map((l) => ({
        id: l.id,
        name: l.name,
        latitude: l.latitude,
        longitude: l.longitude,
        radiusM: l.radius_m,
      })),
      adjustments: adjRes.data.map((a) => ({ id: a.id, date: a.adjust_date, minutes: a.minutes, note: a.note })),
    });
  } catch (e) {
    serverError(res, "time list error", e);
  }
});

router.post("/punch-in", async (req, res) => {
  try {
    const check = await checkGeofence(req.user, req.body);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const { data, error } = await supabaseAdmin
      .from("time_entries")
      .insert({ user_id: req.user.id, punched_in_at: new Date().toISOString(), punched_in_place: check.place })
      .select(COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Du er allerede stemplet inn" });
      }
      throw error;
    }
    res.status(201).json({ entry: toEntry(data) });
  } catch (e) {
    serverError(res, "punch-in error", e);
  }
});

router.post("/punch-out", async (req, res) => {
  const parsed = noteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Ugyldig input" });
  }
  try {
    const check = await checkGeofence(req.user, req.body);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const { data, error } = await supabaseAdmin
      .from("time_entries")
      .update({
        punched_out_at: new Date().toISOString(),
        punched_out_place: check.place,
        ...(parsed.data.note ? { note: parsed.data.note } : {}),
      })
      .eq("user_id", req.user.id)
      .is("punched_out_at", null)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: "Du er ikke stemplet inn" });
    res.json({ entry: toEntry(data) });
  } catch (e) {
    serverError(res, "punch-out error", e);
  }
});

module.exports = router;
