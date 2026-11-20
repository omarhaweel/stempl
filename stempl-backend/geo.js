const { z } = require("zod");
const { supabaseAdmin } = require("./supabase");

const DEFAULT_RADIUS_M = 200;

const positionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// Great-circle distance in metres.
function distanceMeters(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The user's approved work places (godkjente arbeidssteder): [{ id, name, latitude, longitude, radius_m }]. */
async function approvedPlaces(userId) {
  const { data, error } = await supabaseAdmin
    .from("approved_locations")
    .select("id, name, latitude, longitude, radius_m")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Geofence check for punching in/out. A user with approved work places may punch only within their
 * radius; a user without any is not restricted. The position is used only for this check and is
 * never stored; only the NAME of the matching place is returned (to be saved on the stempling).
 *
 * Returns { place } when allowed (place is null if the user isn't restricted),
 * or { status, error } to send back when blocked.
 */
async function checkGeofence(user, body) {
  if (user.role === "admin") return { place: null };

  const data = await approvedPlaces(user.id);
  if (data.length === 0) return { place: null };

  const pos = positionSchema.safeParse(body ?? {});
  if (!pos.success) {
    return { status: 403, error: "Posisjon kreves for å stemple. Slå på posisjonstjenester og prøv igjen." };
  }

  let match = null;
  let matchDistance = Infinity;
  for (const loc of data) {
    const d = distanceMeters(pos.data.latitude, pos.data.longitude, loc.latitude, loc.longitude);
    if (d <= loc.radius_m && d < matchDistance) {
      match = loc;
      matchDistance = d;
    }
  }
  if (match) return { place: match.name };
  return {
    status: 403,
    error: `Du er for langt unna ditt arbeidssted`,
  };
}

module.exports = { checkGeofence, approvedPlaces, distanceMeters, DEFAULT_RADIUS_M };
