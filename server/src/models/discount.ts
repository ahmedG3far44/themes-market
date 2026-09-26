import mongoose, { type Types } from "mongoose";

const { Schema, model, models } = mongoose;

export interface DiscountDocument {
  code: string;
  type: "percentage" | "fixed";
  percentageBps?: number;
  amountMinor?: number;
  currency?: string;
  usageLimit: number;
  timesUsed: number;
  expiresAt: Date;
  active: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<DiscountDocument>({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
  type: { type: String, enum: ["percentage", "fixed"], required: true },
  percentageBps: { type: Number, min: 1, max: 9999, validate: Number.isInteger },
  amountMinor: { type: Number, min: 1, validate: Number.isInteger },
  currency: { type: String, uppercase: true, minlength: 3, maxlength: 3 },
  usageLimit: { type: Number, required: true, min: 1, max: 1_000_000, validate: Number.isInteger },
  timesUsed: { type: Number, required: true, default: 0, min: 0, validate: Number.isInteger },
  expiresAt: { type: Date, required: true, index: true },
  active: { type: Boolean, required: true, default: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

schema.index({ active: 1, expiresAt: 1 });
schema.set("toJSON", {
  transform: (_document, value) => {
    const result = value as unknown as Record<string, unknown>;
    result.id = String(result._id);
    delete result._id;
    delete result.__v;
    return value;
  },
});

const DiscountModel = models.Discount ?? model<DiscountDocument>("Discount", schema);
export default DiscountModel;
