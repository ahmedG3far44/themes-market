import mongoose, { type QueryFilter } from "mongoose";
import EntitlementModel from "../models/entitlement.ts";
import OrderModel from "../models/order.ts";
import ThemeModel, { type ThemeDocument } from "../models/theme.ts";
import UploadAssetModel from "../models/upload-asset.ts";
import { AppError } from "../utils/app-error.ts";
import { serializeAsset } from "./upload.service.ts";

type CatalogQuery = { page: number; limit: number; search?: string; stack?: string; minPrice?: number; maxPrice?: number; featured?: "true" | "false"; sort: "newest" | "price_asc" | "price_desc" | "popular" };

async function mediaFor(theme: Pick<ThemeDocument, "imageAssetIds" | "videoAssetIds">) {
  const ids = [...theme.imageAssetIds, ...theme.videoAssetIds];
  const assets = await UploadAssetModel.find({ _id: { $in: ids }, status: "ready" }).select("+bucket +key +variants.key").lean();
  const serialized = await Promise.all(assets.map(async (asset) => [String(asset._id), await serializeAsset(asset)] as const));
  const byId = new Map(serialized);
  return {
    images: theme.imageAssetIds.map((id) => byId.get(String(id))).filter(Boolean),
    videos: theme.videoAssetIds.map((id) => byId.get(String(id))).filter(Boolean),
  };
}

async function serializeTheme(theme: ThemeDocument & { _id: unknown }, userId?: string) {
  const [media, entitlement, source] = await Promise.all([
    mediaFor(theme),
    userId ? EntitlementModel.exists({ userId, themeId: theme._id, status: "active" }) : null,
    theme.sourceAssetId ? UploadAssetModel.findById(theme.sourceAssetId).lean() : null,
  ]);
  const missingPublishRequirements = [
    ...(!media.images.length && !media.videos.length ? ["processed preview image or video"] : []),
    ...(source?.kind !== "theme_zip" || source.status !== "ready" ? ["source ZIP"] : []),
    ...(!theme.previewUrl ? ["public preview URL"] : []),
    ...(!theme.description ? ["description"] : []),
    ...(!theme.features.length ? ["feature list"] : []),
  ];
  return {
    id: String(theme._id), name: theme.name, slug: theme.slug, shortDescription: theme.shortDescription,
    description: theme.description, stack: theme.stack, features: theme.features, priceMinor: theme.priceMinor,
    currency: theme.currency, version: theme.version, changelog: theme.changelog, setupInstructions: theme.setupInstructions,
    deployInstructions: theme.deployInstructions, previewUrl: theme.previewUrl, images: media.images, videos: media.videos,
    sourceAsset: source ? { id: String(source._id), kind: source.kind, status: source.status, originalName: source.originalName, sizeBytes: source.sizeBytes } : undefined,
    status: theme.status, featured: theme.featured, salesCount: theme.salesCount, purchased: Boolean(entitlement),
    canPurchase: source?.kind === "theme_zip" && source.status === "ready",
    canPublish: missingPublishRequirements.length === 0, missingPublishRequirements,
    publishedAt: theme.publishedAt, seoTitle: theme.seoTitle, seoDescription: theme.seoDescription, createdAt: theme.createdAt, updatedAt: theme.updatedAt,
  };
}

export async function listPublishedThemes(query: CatalogQuery, userId?: string) {
  const filter: QueryFilter<ThemeDocument> = { status: "published" };
  if (query.search) filter.$text = { $search: query.search };
  if (query.stack) filter.stack = { $in: [new RegExp(`^${query.stack.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")] };
  if (query.featured) filter.featured = query.featured === "true";
  if (query.minPrice !== undefined || query.maxPrice !== undefined) filter.priceMinor = { ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}), ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}) };
  const sort: Record<string, 1 | -1> = query.sort === "price_asc" ? { priceMinor: 1 } : query.sort === "price_desc" ? { priceMinor: -1 } : query.sort === "popular" ? { salesCount: -1 } : { publishedAt: -1 };
  const [items, total, stackRows] = await Promise.all([
    ThemeModel.find(filter).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    ThemeModel.countDocuments(filter),
    ThemeModel.aggregate<{ _id: string }>([{ $match: { status: "published" } }, { $unwind: "$stack" }, { $group: { _id: "$stack" } }, { $sort: { _id: 1 } }]),
  ]);
  return { items: await Promise.all(items.map((item) => serializeTheme(item as ThemeDocument & { _id: unknown }, userId))), page: query.page, pageSize: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)), stacks: stackRows.map((row) => row._id) };
}

export async function getPublishedTheme(slug: string, userId?: string) {
  const theme = await ThemeModel.findOne({ slug, status: "published" }).lean();
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  return serializeTheme(theme as ThemeDocument & { _id: unknown }, userId);
}

export async function listAdminThemes(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1), pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 12));
  const filter: QueryFilter<ThemeDocument> = {};
  if (query.status) filter.status = String(query.status) as ThemeDocument["status"];
  if (query.search) filter.name = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const [items, total] = await Promise.all([ThemeModel.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(), ThemeModel.countDocuments(filter)]);
  return { items: await Promise.all(items.map((item) => serializeTheme(item as ThemeDocument & { _id: unknown }))), page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdminTheme(id: string) {
  const theme = await ThemeModel.findById(id).lean();
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  return serializeTheme(theme as ThemeDocument & { _id: unknown });
}

async function validateThemeAssets(userId: unknown, input: Record<string, unknown>): Promise<void> {
  const imageIds = input.imageAssetIds as string[];
  const videoIds = input.videoAssetIds as string[];
  const sourceId = input.sourceAssetId as string;
  const requested = [...imageIds, ...videoIds, sourceId];
  const assets = await UploadAssetModel.find({ _id: { $in: requested }, uploadedBy: userId, status: "ready" }).select("_id kind").lean();
  const byId = new Map(assets.map((asset) => [String(asset._id), asset.kind]));
  const invalidPreview = imageIds.some((assetId) => byId.get(assetId) !== "image") || videoIds.some((assetId) => byId.get(assetId) !== "video");
  if (invalidPreview || (!imageIds.length && !videoIds.length)) {
    throw new AppError(422, "THEME_PREVIEW_REQUIRED", "Upload at least one ready preview image or video");
  }
  if (byId.get(sourceId) !== "theme_zip") {
    throw new AppError(422, "THEME_SOURCE_REQUIRED", "Upload a ready source ZIP file");
  }
}

export async function createTheme(userId: unknown, input: Record<string, unknown>) {
  await validateThemeAssets(userId, input);
  return ThemeModel.create({ ...input, createdBy: userId, status: "draft" });
}
export async function updateTheme(id: string, userId: unknown, input: Record<string, unknown>) {
  const existing = await ThemeModel.findById(id);
  if (!existing) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  await validateThemeAssets(userId, {
    imageAssetIds: input.imageAssetIds ?? existing.imageAssetIds.map(String),
    videoAssetIds: input.videoAssetIds ?? existing.videoAssetIds.map(String),
    sourceAssetId: input.sourceAssetId ?? (existing.sourceAssetId ? String(existing.sourceAssetId) : undefined),
  });
  const theme = await ThemeModel.findByIdAndUpdate(id, input, { returnDocument: "after", runValidators: true });
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  return theme;
}

export async function publishTheme(id: string, publish: boolean) {
  const theme = await ThemeModel.findById(id);
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  if (publish) {
    const image = await UploadAssetModel.exists({ _id: { $in: theme.imageAssetIds }, kind: "image", status: "ready" });
    const video = await UploadAssetModel.exists({ _id: { $in: theme.videoAssetIds }, kind: "video", status: "ready" });
    const source = theme.sourceAssetId ? await UploadAssetModel.exists({ _id: theme.sourceAssetId, kind: "theme_zip", status: "ready" }) : null;
    const missing = [...(!image && !video ? ["processed preview image or video"] : []), ...(!source ? ["source ZIP"] : []), ...(!theme.previewUrl ? ["public preview URL"] : []), ...(!theme.description ? ["description"] : []), ...(!theme.features.length ? ["feature list"] : [])];
    if (missing.length) throw new AppError(409, "THEME_INCOMPLETE", `Complete the theme before publishing. Missing: ${missing.join(", ")}`, [], { missing });
    theme.status = "published"; theme.publishedAt = theme.publishedAt ?? new Date();
  } else theme.status = "draft";
  await theme.save();
  return theme;
}

export async function archiveOrDeleteTheme(id: string) {
  const theme = await ThemeModel.findById(id);
  if (!theme) throw new AppError(404, "THEME_NOT_FOUND", "Theme not found");
  const hasSales = await OrderModel.exists({ status: "paid", "items.themeId": new mongoose.Types.ObjectId(id) });
  if (hasSales) { theme.status = "archived"; theme.featured = false; await theme.save(); return { archived: true }; }
  await theme.deleteOne(); return { archived: false };
}
