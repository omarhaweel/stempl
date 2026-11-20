// Dates and days in Norwegian time (the app is used in Norway; the server may run in UTC).
const TZ = "Europe/Oslo";

/** Today's date in Norway as åååå-mm-dd. */
function todayOslo() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
}

// Offset of Norwegian time from UTC at the given moment, in minutes (60 or 120).
function osloOffsetMinutes(at) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName").value; // e.g. "GMT+1"
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(part);
  if (!m) return 60;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

// The moment (UTC) when the given Norwegian calendar day starts.
function startOfOsloDay(y, m, d) {
  const utcMidnight = Date.UTC(y, m - 1, d);
  return utcMidnight - osloOffsetMinutes(new Date(utcMidnight + 12 * 3600000)) * 60000;
}

/** [start, end) of an åååå-mm-dd day in Norwegian time, as Dates. */
function osloDayRange(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return [
    new Date(startOfOsloDay(y, m, d)),
    new Date(startOfOsloDay(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())),
  ];
}

module.exports = { todayOslo, osloDayRange };
