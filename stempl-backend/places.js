const { supabaseAdmin } = require("./supabase");

// History of places a company has used (fixed places and places sent with dagsplaner). It is kept
// when a fixed place is removed or an old plan is deleted, so the admin can pick the place again.

// The same place is recognised by name and position.
const placeKey = (p) => `${p.name.trim().toLowerCase()}|${p.latitude.toFixed(4)}|${p.longitude.toFixed(4)}`;

/** Remember places as used now (new ones are added, known ones move to the top). */
async function rememberPlaces(companyId, places) {
  const byKey = new Map();
  for (const p of places) byKey.set(placeKey(p), p);
  if (byKey.size === 0) return;

  const keys = [...byKey.keys()];
  const existing = await supabaseAdmin
    .from("place_history")
    .select("id, key, use_count")
    .eq("company_id", companyId)
    .in("key", keys);
  if (existing.error) throw existing.error;
  const known = new Map(existing.data.map((r) => [r.key, r]));
  const now = new Date().toISOString();

  const fresh = [];
  for (const [key, p] of byKey) {
    const row = known.get(key);
    if (row) {
      const { error } = await supabaseAdmin
        .from("place_history")
        .update({ use_count: row.use_count + 1, last_used_at: now })
        .eq("id", row.id);
      if (error) throw error;
    } else {
      fresh.push({
        company_id: companyId,
        key,
        name: p.name.trim(),
        latitude: p.latitude,
        longitude: p.longitude,
        last_used_at: now,
      });
    }
  }
  if (fresh.length > 0) {
    const { error } = await supabaseAdmin.from("place_history").upsert(fresh, { onConflict: "company_id,key", ignoreDuplicates: true });
    if (error) throw error;
  }
}

/** The company's places, most recently used first. */
async function placeHistory(companyId, limit = 100) {
  const { data, error } = await supabaseAdmin
    .from("place_history")
    .select("name, latitude, longitude")
    .eq("company_id", companyId)
    .order("last_used_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((r) => ({ name: r.name, latitude: r.latitude, longitude: r.longitude }));
}

module.exports = { rememberPlaces, placeHistory, placeKey };
