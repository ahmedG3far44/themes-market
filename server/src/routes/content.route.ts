import { Router } from "express";
import { z } from "zod";
import SiteContentModel from "../models/site-content.ts";
import { requireAdmin, requireDatabaseUser } from "../middlewares/auth.ts";
import { AppError } from "../utils/app-error.ts";
import { audit } from "../services/audit.service.ts";

const router = Router();

const socialsSchema = z.object({
  instagram: z.string().trim().max(500).optional().default(""),
  tiktok: z.string().trim().max(500).optional().default(""),
  youtube: z.string().trim().max(500).optional().default(""),
  linkedin: z.string().trim().max(500).optional().default(""),
});

const htmlField = z.string().max(50000).optional().default("");

const contentInputSchema = z.object({
  privacyHtml: htmlField,
  termsHtml: htmlField,
  refundHtml: htmlField,
  socials: socialsSchema.optional().default({ instagram: "", tiktok: "", youtube: "", linkedin: "" }),
});

function toPublic(doc: any) {
  return {
    privacyHtml: doc.privacyHtml ?? "",
    termsHtml: doc.termsHtml ?? "",
    refundHtml: doc.refundHtml ?? "",
    socials: {
      instagram: doc.socials?.instagram ?? "",
      tiktok: doc.socials?.tiktok ?? "",
      youtube: doc.socials?.youtube ?? "",
      linkedin: doc.socials?.linkedin ?? "",
    },
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

const urlOptional = (value: string) => {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

// Public
router.get("/content", async (_req, res, next) => {
  try {
    let doc = await SiteContentModel.findOne({ key: "default" }).lean();
    if (!doc) {
      doc = await SiteContentModel.create({
        key: "default",
        privacyHtml: "",
        termsHtml: "",
        refundHtml: "",
        socials: { instagram: "", tiktok: "", youtube: "", linkedin: "https://linkedin.com/in/ahmedg3far44" },
      });
    }
    res.json({ success: true, data: toPublic(doc) });
  } catch (error) {
    next(error);
  }
});

// Admin read
router.get("/admin/content", requireDatabaseUser, requireAdmin, async (_req, res, next) => {
  try {
    let doc = await SiteContentModel.findOne({ key: "default" }).lean();
    if (!doc) {
      doc = await SiteContentModel.create({
        key: "default",
        privacyHtml: "",
        termsHtml: "",
        refundHtml: "",
        socials: { instagram: "", tiktok: "", youtube: "", linkedin: "https://linkedin.com/in/ahmedg3far44" },
      });
    }
    res.json({ success: true, data: toPublic(doc) });
  } catch (error) {
    next(error);
  }
});

// Admin write
router.put("/admin/content", requireDatabaseUser, requireAdmin, async (req, res, next) => {
  try {
    const parsed = contentInputSchema.parse(req.body);

    // Validate socials are http/https if provided
    for (const [k, v] of Object.entries(parsed.socials)) {
      if (v && !urlOptional(v)) {
        throw new AppError(422, "VALIDATION_ERROR", `${k} must be a valid http(s) URL`);
      }
    }

    const before = await SiteContentModel.findOne({ key: "default" }).lean();
    const updated = await SiteContentModel.findOneAndUpdate(
      { key: "default" },
      {
        $set: {
          privacyHtml: parsed.privacyHtml,
          termsHtml: parsed.termsHtml,
          refundHtml: parsed.refundHtml,
          socials: parsed.socials,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    await audit(req, "site_content.update", "site_content", "default", before, updated);

    res.json({ success: true, data: toPublic(updated!), message: "Content updated" });
  } catch (error) {
    next(error);
  }
});

export default router;
