import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

export interface SiteContentDocument {
  key: string;
  privacyHtml: string;
  termsHtml: string;
  refundHtml: string;
  socials: {
    instagram: string;
    tiktok: string;
    youtube: string;
    linkedin: string;
  };
  updatedAt: Date;
  createdAt: Date;
}

const schema = new Schema<SiteContentDocument>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    privacyHtml: { type: String, default: "" },
    termsHtml: { type: String, default: "" },
    refundHtml: { type: String, default: "" },
    socials: {
      instagram: { type: String, default: "" },
      tiktok: { type: String, default: "" },
      youtube: { type: String, default: "" },
      linkedin: { type: String, default: "https://linkedin.com/in/ahmedg3far44" },
    },
  },
  { timestamps: true }
);

const SiteContentModel = models.SiteContent ?? model<SiteContentDocument>("SiteContent", schema);
export default SiteContentModel;
