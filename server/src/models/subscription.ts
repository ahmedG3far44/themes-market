import mongoose from "mongoose";
import type { Types } from "mongoose";

const { Schema, model, models } = mongoose;

export interface SubscriptionDocument {
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  status: "active" | "canceled" | "trialing" | "expired";
  startDate: Date;
  expirationDate?: Date;
  provider?: string;
  externalSubscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<SubscriptionDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
  status: { type: String, enum: ["active", "canceled", "trialing", "expired"], default: "active", index: true },
  startDate: { type: Date, default: Date.now },
  expirationDate: Date,
  provider: String,
  externalSubscriptionId: String,
}, { timestamps: true });

subscriptionSchema.set("toJSON", {
  transform: (_document, value) => {
    const result = value as unknown as Record<string, unknown>;
    result.id = String(result._id);
    delete result._id;
    delete result.__v;
    return value;
  },
});

const SubscriptionModel = models.Subscription ?? model<SubscriptionDocument>("Subscription", subscriptionSchema);
export default SubscriptionModel;
