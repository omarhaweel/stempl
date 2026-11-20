const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { supabaseAdmin } = require("./supabase");
const { requireAuth, registerSchema, BCRYPT_ROUNDS } = require("./auth");

const router = express.Router();

// Role is read from the database by requireAuth, never from the token.
router.use(requireAuth, (req, res, next) => {
  if (req.user.role !== "super_admin") return res.status(403).json({ error: "Ingen tilgang" });
  next();
});

const idSchema = z.string().uuid();
const orgSchema = z.string().trim().transform((s) => s.replace(/\s/g, ""));

// Modulus 11 check of an organisasjonsnummer (9 digits, last digit is the check digit).
function validOrgNumber(nr) {
  if (!/^\d{9}$/.test(nr)) return false;
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(nr[i]), 0);
  const control = 11 - (sum % 11);
  if (control === 10) return false;
  return (control === 11 ? 0 : control) === Number(nr[8]);
}

// Looks the number up in Enhetsregisteret (Brønnøysundregistrene, open API).
// Only the (public) organisasjonsnummer is sent. Returns { name } or { error, status }.
async function lookupCompany(orgNumber) {
  if (!validOrgNumber(orgNumber)) {
    return { status: 400, error: "Ugyldig organisasjonsnummer" };
  }
  let res;
  try {
    res = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgNumber}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { status: 502, error: "Kunne ikke kontakte Brønnøysundregistrene. Prøv igjen senere." };
  }
  if (res.status === 404 || res.status === 410) {
    return { status: 404, error: "Fant ikke organisasjonsnummeret i Brønnøysundregistrene" };
  }
  if (!res.ok) return { status: 502, error: "Brønnøysundregistrene svarte med en feil. Prøv igjen senere." };
  const data = await res.json();
  if (data.slettedato) return { status: 400, error: "Enheten er slettet i Enhetsregisteret" };
  return { name: String(data.navn).slice(0, 200) };
}

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

const toCompany = (c, users) => ({
  id: c.id,
  orgNumber: c.org_number,
  name: c.name,
  isActive: c.is_active,
  createdAt: c.created_at,
  userCount: users.length,
  admins: users
    .filter((u) => u.role === "admin")
    .map((u) => ({ id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, isActive: u.is_active })),
});

// Name for an organisasjonsnummer, before the company is added.
router.get(
  "/lookup/:orgNumber",
  wrap("super lookup", async (req, res) => {
    const found = await lookupCompany(orgSchema.parse(req.params.orgNumber));
    if (found.error) return res.status(found.status).json({ error: found.error });
    res.json({ name: found.name });
  }),
);

router.get(
  "/companies",
  wrap("super list companies", async (req, res) => {
    const [companies, users] = await Promise.all([
      supabaseAdmin.from("companies").select("id, org_number, name, is_active, created_at").order("name"),
      supabaseAdmin.from("users").select("id, email, first_name, last_name, role, is_active, company_id").not("company_id", "is", null),
    ]);
    if (companies.error) throw companies.error;
    if (users.error) throw users.error;
    res.json({
      companies: companies.data.map((c) =>
        toCompany(c, users.data.filter((u) => u.company_id === c.id)),
      ),
    });
  }),
);

router.post(
  "/companies",
  wrap("super add company", async (req, res) => {
    const parsed = orgSchema.safeParse(req.body?.orgNumber ?? "");
    if (!parsed.success) return validationError(res, parsed.error.issues);
    const orgNumber = parsed.data;

    const found = await lookupCompany(orgNumber);
    if (found.error) return res.status(found.status).json({ error: found.error, errors: { orgNumber: found.error } });

    const { data, error } = await supabaseAdmin
      .from("companies")
      .insert({ org_number: orgNumber, name: found.name, created_by: req.user.id })
      .select("id, org_number, name, is_active, created_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Selskapet er allerede lagt til", errors: { orgNumber: "Selskapet er allerede lagt til" } });
      }
      throw error;
    }
    res.status(201).json({ company: toCompany(data, []) });
  }),
);

router.patch(
  "/companies/:id",
  wrap("super edit company", async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    const body = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!id.success || !body.success) return res.status(400).json({ error: "Ugyldig input" });
    const { data, error } = await supabaseAdmin
      .from("companies")
      .update({ is_active: body.data.isActive })
      .eq("id", id.data)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Fant ikke selskapet" });
    res.json({ ok: true });
  }),
);

// Deletes a company together with all its users (admins included) and their data
// (stemplinger, approved places) through the database's ON DELETE CASCADE.
router.delete(
  "/companies/:id",
  wrap("super delete company", async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Ugyldig id" });
    const { data, error } = await supabaseAdmin
      .from("companies")
      .delete()
      .eq("id", id.data)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Fant ikke selskapet" });
    res.json({ ok: true });
  }),
);

// Creates an administrator for a company (the company's first login).
router.post(
  "/companies/:id/admins",
  wrap("super add company admin", async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Ugyldig id" });
    const parsed = registerSchema.omit({ role: true }).safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error.issues);
    const { email, password, firstName, lastName, phone, dateOfBirth } = parsed.data;

    const company = await supabaseAdmin.from("companies").select("id").eq("id", id.data).maybeSingle();
    if (company.error) throw company.error;
    if (!company.data) return res.status(404).json({ error: "Fant ikke selskapet" });

    const { data, error } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        first_name: firstName,
        last_name: lastName,
        phone: phone ?? null,
        date_of_birth: dateOfBirth ?? null,
        role: "admin",
        company_id: company.data.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Det finnes allerede en bruker med denne e-posten", errors: { email: "E-posten er allerede i bruk" } });
      }
      throw error;
    }
    res.status(201).json({ id: data.id });
  }),
);

module.exports = router;
