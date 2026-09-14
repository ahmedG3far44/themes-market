import mongoose, { type Types } from "mongoose";

const { Schema, model, models } = mongoose;
export interface CartDocument {
  userId: Types.ObjectId;
  items: Array<{ themeId: Types.ObjectId; addedAt: Date; priceSnapshotMinor: number }>;
  discountCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<CartDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  items: { type: [{ themeId: { type: Schema.Types.ObjectId, ref: "Theme", required: true }, addedAt: { type: Date, default: Date.now }, priceSnapshotMinor: { type: Number, required: true } }], default: [] },
  discountCode: { type: String, uppercase: true, trim: true },
}, { timestamps: true });

const CartModel = models.Cart ?? model<CartDocument>("Cart", schema);
export default CartModel;
