import mongoose, { type Types } from "mongoose";

const { Schema, model, models } = mongoose;
export interface UploadAssetDocument {
  kind: "image" | "video" | "theme_zip";
  status: "pending" | "uploading" | "processing" | "ready" | "failed";
  bucket: string;
  key: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  checksum?: string;
  externalUrl?: string;
  uploadId?: string;
  variants: Array<{ format: string; key: string; width?: number; height?: number; sizeBytes: number }>;
  uploadedBy: Types.ObjectId;
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<UploadAssetDocument>({
  kind: { type: String, enum: ["image", "video", "theme_zip"], required: true, index: true },
  status: { type: String, enum: ["pending", "uploading", "processing", "ready", "failed"], default: "pending", index: true },
  bucket: { type: String, required: true, select: false },
  key: { type: String, required: true, unique: true, select: false },
  originalName: { type: String, required: true },
  contentType: { type: String, required: true },
  sizeBytes: { type: Number, required: true, min: 1 },
  checksum: { type: String, select: false },
  externalUrl: { type: String },
  uploadId: { type: String, select: false },
  variants: { type: [{ format: String, key: { type: String, select: false }, width: Number, height: Number, sizeBytes: Number }], default: [] },
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  errorCode: String,
}, { timestamps: true });

schema.index({ uploadedBy: 1, createdAt: -1 });
const UploadAssetModel = models.UploadAsset ?? model<UploadAssetDocument>("UploadAsset", schema);
export default UploadAssetModel;
