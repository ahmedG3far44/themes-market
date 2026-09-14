import { Router } from "express";
import { requireDatabaseUser } from "../middlewares/auth.ts";

const router = Router();
router.use(requireDatabaseUser);

router.get("/me", (req, res) => {
  res.json({ success: true, data: req.currentUser });
});

router.put("/me", async (req, res, next) => {
  try {
    const name = String(req.body.name ?? "").trim();
    if (!name) throw new Error("Invalid name");
    req.currentUser!.name = name;
    req.currentUser!.username = req.body.username ? String(req.body.username).trim() : undefined;
    await req.currentUser!.save();
    res.json({ success: true, data: req.currentUser, message: "Profile updated" });
  } catch (error) { next(error); }
});

export default router;
