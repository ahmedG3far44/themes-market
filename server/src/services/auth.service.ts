import env from "../config/env.ts";
import UserModel from "../models/user.ts";
import type { UserProvider } from "../../../shared/types.ts";
import { sendEmailTemplate } from "./email.service.ts";

interface ClerkEmail {
  id: string;
  email_address: string;
}

interface ClerkPhone {
  id: string;
  phone_number: string;
}

interface ClerkUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  image_url: string;
  primary_email_address_id: string | null;
  email_addresses: ClerkEmail[];
  primary_phone_number_id: string | null;
  phone_numbers: ClerkPhone[];
  external_accounts: Array<{ provider: string }>;
}

function mapProvider(provider?: string): UserProvider {
  if (!provider) return "email";
  if (provider.includes("google")) return "google";
  if (provider.includes("github")) return "github";
  if (provider.includes("microsoft")) return "microsoft";
  if (provider.includes("apple")) return "apple";
  return "unknown";
}

export async function getClerkUser(clerkId: string): Promise<ClerkUser> {
  if (!env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY is not configured");

  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`, {
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
  });
  const data = await response.json() as ClerkUser & { message?: string };
  if (!response.ok) throw new Error(data.message ?? "Unable to load the signed-in Clerk user");
  return data;
}

export async function syncLoggedInUser(clerkId: string) {
  const clerkUser = await getClerkUser(clerkId);
  const primaryEmail = clerkUser.email_addresses.find((item) => item.id === clerkUser.primary_email_address_id)
    ?? clerkUser.email_addresses[0];
  if (!primaryEmail) throw new Error("The Clerk account has no email address");

  const email = primaryEmail.email_address.toLowerCase();
  const primaryPhone = clerkUser.phone_numbers?.find((item) => item.id === clerkUser.primary_phone_number_id)
    ?? clerkUser.phone_numbers?.[0];
  const displayName = [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ")
    || clerkUser.username
    || email.split("@")[0]
    || "User";

  const user = await UserModel.findOneAndUpdate(
    { $or: [{ clerkId }, { email }] },
    {
      $set: {
        clerkId,
        email,
        name: displayName,
        username: clerkUser.username ?? undefined,
        phone: primaryPhone?.phone_number ?? undefined,
        avatarUrl: clerkUser.image_url,
        provider: mapProvider(clerkUser.external_accounts[0]?.provider),
        lastLoginAt: new Date(),
      },
      $setOnInsert: {
        role: email === env.ADMIN_EMAIL.toLowerCase() ? "admin" : "customer",
        status: "active",
        joinedAt: new Date(),
        welcomeEmailState: "pending",
      },
    },
    { returnDocument: "after", upsert: true, runValidators: true },
  );
  if (user.role === "user") {
    user.role = "customer";
    await user.save();
  }

  const retryBefore = new Date(Date.now() - 10 * 60_000);
  const welcomeRecipient = await UserModel.findOneAndUpdate(
    {
      _id: user._id,
      $or: [
        { welcomeEmailState: { $in: ["pending", "failed"] } },
        { welcomeEmailState: "sending", welcomeEmailAttemptedAt: { $lt: retryBefore } },
      ],
    },
    { $set: { welcomeEmailState: "sending", welcomeEmailAttemptedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (welcomeRecipient) {
    try {
      await sendEmailTemplate({
        to: welcomeRecipient.email,
        type: "welcome",
        variables: { name: welcomeRecipient.name },
        idempotencyKey: `welcome-user/${String(welcomeRecipient._id)}`,
      });
      await UserModel.updateOne({ _id: welcomeRecipient._id }, { $set: { welcomeEmailState: "sent", welcomeEmailSentAt: new Date() } });
    } catch (error) {
      console.error("Welcome email delivery failed", { userId: String(welcomeRecipient._id), error });
      await UserModel.updateOne({ _id: welcomeRecipient._id }, { $set: { welcomeEmailState: "failed" } });
    }
  }
  return user;
}
