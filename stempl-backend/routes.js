const express = require("express");
const { router: authRouter } = require("./auth");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

router.use("/auth", authRouter);
router.use("/time", require("./time"));
const dagsplan = require("./dagsplan");
router.use("/me", dagsplan.employeeRouter);
router.use("/admin", dagsplan.adminRouter);
router.use("/admin", require("./admin"));
router.use("/super", require("./super"));

module.exports = router;
