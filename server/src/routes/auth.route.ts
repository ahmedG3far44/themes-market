import { getAuth } from "@clerk/express";
import { Router } from "express";
import { requireClerkAuth } from "../middlewares/auth.ts";
import { syncLoggedInUser } from "../services/auth.service.ts";

const router = Router();

router.post("/sync", requireClerkAuth, async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const user = await syncLoggedInUser(userId!);
    if (user.status === "blocked") {
      res.status(403).json({ success: false, message: "Your account has been blocked. Contact support." });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

export default router;
