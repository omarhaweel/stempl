require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const routes = require("./routes");

const app = express();
// Render (and most hosts) put a proxy in front: needed for correct client IPs in rate limiting.
app.set("trust proxy", 1);
app.use(helmet());

// Mobile apps send no Origin header, so they are always allowed. Set ALLOWED_ORIGINS
// (comma-separated) to restrict browser origins; unset = allow all.
const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors(allowed.length ? { origin: allowed } : undefined));
app.use(express.json({ limit: "10kb" }));

app.use("/", routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`API running on port ${PORT}`));
