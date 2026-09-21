import mongoose from "mongoose";
import type { UserProvider, UserRole, UserStatus } from "../../../shared/types.ts";

const { Schema, model, models } = mongoose;

export interface UserDocument {
  clerkId?: string;
  email: string;
  provider: UserProvider;
  avatarUrl?: string;
  name: string;
  username?: string;
  phone?: string;
  role: UserRole | "user";
  status: UserStatus;
  lastLoginAt?: Date;
  welcomeEmailState?: "pending" | "sending" | "sent" | "failed";
  welcomeEmailAttemptedAt?: Date;
  welcomeEmailSentAt?: Date;
  marketingOptOutAt?: Date;
  joinedAt: Date;
  blockedAt?: Date;
  blockedBy?: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>({
  clerkId: { type: String, unique: true, sparse: true, index: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  provider: { type: String, enum: ["email", "google", "github", "microsoft", "apple", "unknown"], default: "unknown", index: true },
  avatarUrl: String,
  name: { type: String, required: true, trim: true },
  username: { type: String, trim: true },
  phone: { type: String, trim: true },
  role: { type: String, enum: ["admin", "customer", "user"], default: "customer", index: true },
  status: { type: String, enum: ["active", "blocked"], default: "active", index: true },
  lastLoginAt: Date,
  welcomeEmailState: { type: String, enum: ["pending", "sending", "sent", "failed"] },
  welcomeEmailAttemptedAt: Date,
  welcomeEmailSentAt: Date,
  marketingOptOutAt: { type: Date, index: true },
  joinedAt: { type: Date, default: Date.now, index: true },
  blockedAt: Date,
  blockedBy: { type: Schema.Types.ObjectId, ref: "User" },
  deletedAt: Date,
}, { timestamps: true });

userSchema.index({ role: 1, status: 1 });

userSchema.set("toJSON", {
  transform: (_document, value) => {
    const result = value as unknown as Record<string, unknown>;
    result.id = String(result._id);
    delete result._id;
    delete result.__v;
    return value;
  },
});

const UserModel = models.User ?? model<UserDocument>("User", userSchema);
export default UserModel;
