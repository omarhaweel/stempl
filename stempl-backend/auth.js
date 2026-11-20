const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { supabaseAdmin } = require("./supabase");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const BCRYPT_ROUNDS = 12;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set in stempl-backend/.env (min 32 chars)");
}

// Compared against when the email is unknown, so response time doesn't leak
// which emails exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", BCRYPT_ROUNDS);

const PUBLIC_COLUMNS =
  "id, email, first_name, last_name, phone, date_of_birth, role, created_at, company_id";
// Also loads the company (name + whether it is active).
const COMPANY_EMBED = "company:companies!users_company_id_fkey(name, org_number, is_active)";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ugyldig e-postadresse").max(254),
  password: z
    .string()
    .min(8, "Passordet må ha minst 8 tegn")
    .max(72, "Passordet kan ha maks 72 tegn")
    .regex(/[a-z]/, "Passordet må ha en liten bokstav")
    .regex(/[A-Z]/, "Passordet må ha en stor bokstav")
    .regex(/[0-9]/, "Passordet må ha et tall"),
  firstName: z.string().trim().min(1, "Påkrevd").max(50, "Maks 50 tegn"),
  lastName: z.string().trim().min(1, "Påkrevd").max(50, "Maks 50 tegn"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Ugyldig telefonnummer")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Bruk formatet ÅÅÅÅ-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d) < new Date(), "Ugyldig dato")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Admin can never be self-assigned.
  role: z.enum(["customer", "professional"]).default("customer"),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ugyldig e-postadresse").max(254),
  password: z.string().min(1).max(72),
});

function signToken(user) {
  return jwt.sign({ role: user.role }, JWT_SECRET, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: JWT_EXPIRES_IN,
  });
}

function toPublic(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    dateOfBirth: row.date_of_birth,
    role: row.role,
    createdAt: row.created_at,
    companyId: row.company_id ?? null,
    companyName: row.company?.name ?? null,
    companyOrgNumber: row.company?.org_number ?? null,
  };
}

function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const errors = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path.join(".") || "_"] ??= issue.message;
      }
      return res.status(400).json({ error: "Ugyldig input", errors });
    }
    req.body = parsed.data;
    next();
  };
}

// Verifies the Bearer token and loads the (still active) user.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Du må logge inn" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select(`${PUBLIC_COLUMNS}, is_active, ${COMPANY_EMBED}`)
      .eq("id", payload.sub)
      .maybeSingle();
    if (error) throw error;
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Ugyldig innlogging" });
    }
    if (user.company_id && !user.company?.is_active) {
      return res.status(401).json({ error: "Selskapet er deaktivert" });
    }
    req.user = user;
    next();
  } catch (e) {
    if (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Innloggingen er utløpt. Logg inn på nytt." });
    }
    console.error("auth error:", e.message);
    res.status(500).json({ error: "Serverfeil. Prøv igjen senere." });
  }
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "For mange forsøk. Prøv igjen senere." },
});

const router = express.Router();

// There is no public registration: users are created by an admin (POST /admin/users).

router.post("/login", authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Everyone logs in with just email + password. The email is unique and identifies the user,
    // whose company (organisasjonsnummer) was set by the super admin (for admins) or by their admin.
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select(`${PUBLIC_COLUMNS}, password_hash, is_active, ${COMPANY_EMBED}`)
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;

    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok || !user.is_active) {
      return res.status(401).json({ error: "Feil e-post eller passord" });
    }
    if (user.company_id && !user.company?.is_active) {
      return res.status(401).json({ error: "Selskapet er deaktivert" });
    }

    await supabaseAdmin
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

    res.json({ token: signToken(user), user: toPublic(user) });
  } catch (e) {
    console.error("login error:", e.message);
    res.status(500).json({ error: "Serverfeil. Prøv igjen senere." });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: toPublic(req.user) });
});

module.exports = {
  router,
  requireAuth,
  registerSchema,
  toPublic,
  PUBLIC_COLUMNS,
  COMPANY_EMBED,
  BCRYPT_ROUNDS,
};
