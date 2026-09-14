import mongoose, { type Types } from "mongoose";

const { Schema, model, models } = mongoose;
export interface EntitlementDocument {
  userId: Types.ObjectId;
  themeId: Types.ObjectId;
  orderId: Types.ObjectId;
  orderItemId: Types.ObjectId;
  purchasedVersion: string;
  sourceAssetId: Types.ObjectId;
  downloadLimit: number;
  downloadsUsed: number;
  status: "active" | "revoked";
  purchasedAt: Date;
  lastDownloadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<EntitlementDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  themeId: { type: Schema.Types.ObjectId, ref: "Theme", required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  orderItemId: { type: Schema.Types.ObjectId, required: true },
  purchasedVersion: { type: String, required: true },
  sourceAssetId: { type: Schema.Types.ObjectId, ref: "UploadAsset", required: true },
  downloadLimit: { type: Number, default: 5 },
  downloadsUsed: { type: Number, default: 0 },
  status: { type: String, enum: ["active", "revoked"], default: "active" },
  purchasedAt: { type: Date, required: true },
  lastDownloadedAt: Date,
}, { timestamps: true });

schema.index({ userId: 1, themeId: 1 }, { unique: true });
schema.index({ userId: 1, purchasedAt: -1 });
const EntitlementModel = models.Entitlement ?? model<EntitlementDocument>("Entitlement", schema);
export default EntitlementModel;
