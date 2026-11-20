// Creates a super admin (manages companies). Run once:
//   $env:SUPER_ADMIN_EMAIL="deg@eksempel.no"; $env:SUPER_ADMIN_PASSWORD="Passord123"; node create-super-admin.js
require("dotenv").config();
const bcrypt = require("bcrypt");
const { supabaseAdmin } = require("./supabase");

const email = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD || "";
const firstName = process.env.SUPER_ADMIN_FIRST_NAME || "System";
const lastName = process.env.SUPER_ADMIN_LAST_NAME || "Administrator";

(async () => {
  if (!email || password.length < 8) {
    console.error("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (min 8 characters).");
    process.exit(1);
  }
  const { error } = await supabaseAdmin.from("users").insert({
    email,
    password_hash: await bcrypt.hash(password, 12),
    first_name: firstName,
    last_name: lastName,
    role: "super_admin",
    company_id: null,
  });
  if (error) {
    console.error(error.code === "23505" ? "A super admin with this email already exists." : error.message);
    process.exit(1);
  }
  console.log(`Super admin created: ${email}`);
})();
