import mongoose, { type Types } from "mongoose";

const { Schema, model, models } = mongoose;
export interface DiscountDocument {
  code: string;
  percentage: number;
  startsAt?: Date;
  expiresAt: Date;
  active: boolean;
  usageLimit?: number;
  redemptionCount: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<DiscountDocument>({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, minlength: 3, maxlength: 32 },
  percentage: { type: Number, required: true, min: 1, max: 100 },
  startsAt: Date,
  expiresAt: { type: Date, required: true, index: true },
  active: { type: Boolean, default: true, index: true },
  usageLimit: { type: Number, min: 1 },
  redemptionCount: { type: Number, default: 0, min: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

schema.index({ active: 1, startsAt: 1, expiresAt: 1 });
const DiscountModel = models.Discount ?? model<DiscountDocument>("Discount", schema);
export default DiscountModel;
