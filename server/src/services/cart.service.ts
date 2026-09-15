import CartModel from "../models/cart.ts";
import DiscountModel from "../models/discount.ts";
import EntitlementModel from "../models/entitlement.ts";
import ThemeModel from "../models/theme.ts";
import UploadAssetModel from "../models/upload-asset.ts";
import { AppError } from "../utils/app-error.ts";
import { serializeAsset } from "./upload.service.ts";

export async function validDiscount(code?: string) {
  if (!code) return null;
  const now = new Date();
  const discount = await DiscountModel.findOne({ code: code.toUpperCase(), active: true, expiresAt: { $gt: now }, $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }] });
  if (!discount || (discount.usageLimit !== undefined && discount.redemptionCount >= discount.usageLimit)) throw new AppError(409, "DISCOUNT_INVALID", "This discount code is invalid, expired, or fully redeemed");
  return discount;
}

export async function getCart(userId: unknown) {
  const cart = await CartModel.findOne({ userId }).lean();
  type RawCartItem = { themeId: unknown; addedAt: Date };
  type CartViewItem = { themeId: string; name: string; slug: string; priceMinor: number; currency: string; addedAt: Date; previewAsset?: Awaited<ReturnType<typeof serializeAsset>> };
  const cartItems = (cart?.items ?? []) as RawCartItem[];
  const ids = cartItems.map((item: RawCartItem) => item.themeId);
  const themes = await ThemeModel.find({ _id: { $in: ids }, status: "published" }).lean();
  const byId = new Map(themes.map((theme) => [String(theme._id), theme]));
  const previewIds = themes.map((theme) => theme.previewAssetId ?? theme.videoAssetIds[0] ?? theme.imageAssetIds[0]).filter(Boolean);
  const previewAssets = await UploadAssetModel.find({ _id: { $in: previewIds }, status: "ready", kind: { $in: ["image", "video"] } }).select("+bucket +key +variants.key").lean();
  const serializedPreviews = await Promise.all(previewAssets.map(async (asset) => [String(asset._id), await serializeAsset(asset)] as const));
  const previewById = new Map(serializedPreviews);
  const items: CartViewItem[] = cartItems.flatMap((item: RawCartItem) => {
    const theme = byId.get(String(item.themeId));
    if (!theme) return [];
    const previewId = theme.previewAssetId ?? theme.videoAssetIds[0] ?? theme.imageAssetIds[0];
    return [{ themeId: String(theme._id), name: theme.name, slug: theme.slug, priceMinor: theme.priceMinor, currency: theme.currency, addedAt: item.addedAt, previewAsset: previewId ? previewById.get(String(previewId)) : undefined }];
  });
  const currency = items[0]?.currency ?? "USD";
  if (items.some((item: CartViewItem) => item.currency !== currency)) throw new AppError(409, "MIXED_CURRENCY_CART", "Cart items must use one currency");
  const subtotalMinor = items.reduce((sum: number, item: CartViewItem) => sum + item.priceMinor, 0);
  let discount = null;
  if (cart?.discountCode) { try { discount = await validDiscount(cart.discountCode); } catch { await CartModel.updateOne({ userId }, { $unset: { discountCode: 1 } }); } }
  const discountMinor = discount ? Math.floor(subtotalMinor * discount.percentage / 100) : 0;
  return { items, discountCode: discount?.code, discountPercentage: discount?.percentage, currency, subtotalMinor, discountMinor, totalMinor: subtotalMinor - discountMinor, updatedAt: cart?.updatedAt ?? new Date() };
}

export async function addCartItem(userId: unknown, themeId: string) {
  const [theme, owned] = await Promise.all([ThemeModel.findOne({ _id: themeId, status: "published" }), EntitlementModel.exists({ userId, themeId, status: "active" })]);
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  const sourceReady = theme.sourceAssetId ? await UploadAssetModel.exists({ _id: theme.sourceAssetId, kind: "theme_zip", status: "ready" }) : null;
  if (!sourceReady) throw new AppError(409, "THEME_NOT_PURCHASABLE", "This theme is available to preview but its download package is not ready yet");
  if (owned) throw new AppError(409, "THEME_ALREADY_OWNED", "You already own this theme");
  const existing = await CartModel.exists({ userId, "items.themeId": theme._id });
  if (existing) throw new AppError(409, "CART_ITEM_EXISTS", "This theme is already in your cart");
  await CartModel.findOneAndUpdate({ userId }, { $push: { items: { themeId: theme._id, addedAt: new Date(), priceSnapshotMinor: theme.priceMinor } } }, { upsert: true, returnDocument: "after" });
  return getCart(userId);
}

export async function removeCartItem(userId: unknown, themeId: string) { await CartModel.updateOne({ userId }, { $pull: { items: { themeId } } }); return getCart(userId); }
export async function applyCartDiscount(userId: unknown, code: string) { await validDiscount(code); await CartModel.findOneAndUpdate({ userId }, { $set: { discountCode: code.toUpperCase() } }, { upsert: true }); return getCart(userId); }
export async function clearCartDiscount(userId: unknown) { await CartModel.updateOne({ userId }, { $unset: { discountCode: 1 } }); return getCart(userId); }
