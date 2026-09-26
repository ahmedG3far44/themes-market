import { Router } from "express";
import { requireCustomer, requireDatabaseUser } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rate-limit.ts";
import { cartItemSchema, discountCodeSchema, parseOrThrow } from "../schemas/marketplace.ts";
import { addCartItem, getCart, getDiscountQuoteForCart, removeCartItem } from "../services/cart.service.ts";
const router = Router(); router.use(requireDatabaseUser, requireCustomer);
router.get("/", async (req, res, next) => { try { res.json({ success: true, data: await getCart(req.currentUser!._id, req.ip) }); } catch (error) { next(error); } });
router.post("/items", async (req, res, next) => { try { const { themeId } = parseOrThrow(cartItemSchema, req.body); res.status(201).json({ success: true, data: await addCartItem(req.currentUser!._id, themeId, req.ip), message: "Added to cart" }); } catch (error) { next(error); } });
router.delete("/items/:themeId", async (req, res, next) => { try { const { themeId } = parseOrThrow(cartItemSchema, req.params); res.json({ success: true, data: await removeCartItem(req.currentUser!._id, themeId, req.ip), message: "Removed from cart" }); } catch (error) { next(error); } });
router.post("/discounts/validate", rateLimit("discount-validate", 30, 60_000, true), async (req, res, next) => {
  try {
    const { code } = parseOrThrow(discountCodeSchema, req.body);
    res.json({ success: true, data: await getDiscountQuoteForCart(req.currentUser!._id, code, req.ip), message: "Discount applied" });
  } catch (error) { next(error); }
});
export default router;
