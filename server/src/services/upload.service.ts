import { randomUUID } from "node:crypto";
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import env from "../config/env.ts";
import { getR2Client } from "../config/r2.ts";
import UploadAssetModel from "../models/upload-asset.ts";
import { AppError } from "../utils/app-error.ts";

const types = { image: new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]), video: new Set(["video/mp4", "video/webm"]), theme_zip: new Set(["application/zip", "application/x-zip", "application/x-zip-compressed", "application/octet-stream"]) };
function maximumBytes(kind: keyof typeof types): number { return (kind === "image" ? env.MAX_IMAGE_SIZE_MB : kind === "video" ? env.MAX_VIDEO_SIZE_MB : env.MAX_THEME_ZIP_SIZE_MB) * 1024 * 1024; }
function safeName(value: string): string { return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "upload"; }
async function mediaUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(getR2Client(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: env.R2_MEDIA_URL_TTL_SECONDS });
}

export async function serializeAsset(asset: { _id: unknown; kind: string; status: string; bucket?: string; key?: string; originalName: string; contentType: string; sizeBytes: number; externalUrl?: string; variants?: Array<{ format: string; key?: string; width?: number; height?: number; sizeBytes: number }> }) {
  const variants = await Promise.all((asset.variants ?? []).map(async (variant) => ({ format: variant.format, url: variant.key && asset.bucket ? await mediaUrl(asset.bucket, variant.key) : undefined, width: variant.width, height: variant.height, sizeBytes: variant.sizeBytes })));
  const originalUrl = !asset.externalUrl && asset.kind !== "theme_zip" && asset.bucket && asset.key ? await mediaUrl(asset.bucket, asset.key) : undefined;
  return { id: String(asset._id), kind: asset.kind, status: asset.status, originalName: asset.originalName, contentType: asset.contentType, sizeBytes: asset.sizeBytes, variants, url: asset.kind !== "theme_zip" ? asset.externalUrl ?? variants[0]?.url ?? originalUrl : undefined };
}

export async function initiateUpload(userId: unknown, input: { kind: keyof typeof types; originalName: string; contentType: string; sizeBytes: number; checksum?: string }) {
  if (!types[input.kind].has(input.contentType)) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "This file type is not allowed");
  if (input.kind === "theme_zip" && !input.originalName.toLowerCase().endsWith(".zip")) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Theme source must be a ZIP file");
  if (input.sizeBytes > maximumBytes(input.kind)) throw new AppError(413, "FILE_TOO_LARGE", `The file exceeds the ${Math.round(maximumBytes(input.kind) / 1024 / 1024)} MB limit`);
  const bucket = env.R2_BUCKET;
  if (!bucket) throw new AppError(503, "STORAGE_UNAVAILABLE", "File storage is not configured");
  const key = `${input.kind}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName(input.originalName)}`;
  const result = await getR2Client().send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: input.contentType, Metadata: input.checksum ? { checksum: input.checksum } : undefined }));
  if (!result.UploadId) throw new AppError(502, "UPLOAD_INIT_FAILED", "Storage did not create an upload session");
  const asset = await UploadAssetModel.create({ ...input, bucket, key, uploadId: result.UploadId, uploadedBy: userId, status: "uploading" });
  return { asset: await serializeAsset(asset), uploadId: result.UploadId, partSizeBytes: 8 * 1024 * 1024 };
}

export async function uploadPart(assetId: string, userId: unknown, partNumber: number, body: Buffer): Promise<string> {
  const asset = await UploadAssetModel.findOne({ _id: assetId, uploadedBy: userId }).select("+bucket +key +uploadId");
  if (!asset || !asset.uploadId) throw new AppError(404, "UPLOAD_NOT_FOUND", "Upload session not found");
  if (!body.length) throw new AppError(400, "EMPTY_UPLOAD_PART", "The uploaded file part is empty");
  if (body.length > 8 * 1024 * 1024) throw new AppError(413, "UPLOAD_PART_TOO_LARGE", "The uploaded file part exceeds the 8 MB limit");
  const result = await getR2Client().send(new UploadPartCommand({ Bucket: asset.bucket, Key: asset.key, UploadId: asset.uploadId, PartNumber: partNumber, Body: body, ContentLength: body.length }));
  if (!result.ETag) throw new AppError(502, "UPLOAD_PART_FAILED", "Storage did not confirm the uploaded file part");
  return result.ETag;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  const candidate = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (!candidate?.transformToByteArray) throw new Error("Storage returned an unreadable object");
  return Buffer.from(await candidate.transformToByteArray());
}

async function processImage(assetId: string): Promise<void> {
  const asset = await UploadAssetModel.findById(assetId).select("+bucket +key");
  if (!asset) return;
  try {
    await UploadAssetModel.updateOne({ _id: asset._id }, { status: "processing" });
    const original = await getR2Client().send(new GetObjectCommand({ Bucket: asset.bucket, Key: asset.key }));
    const buffer = await streamToBuffer(original.Body);
    // Keep the original GIF so the thumbnail retains all animation frames.
    if (asset.contentType === "image/gif") {
      const metadata = await sharp(buffer, { animated: true, failOn: "error" }).metadata();
      if (metadata.format !== "gif") throw new Error("The uploaded file is not a GIF");
      await UploadAssetModel.updateOne({ _id: asset._id }, { status: "ready", variants: [], $unset: { errorCode: 1, uploadId: 1 } });
      return;
    }
    const image = sharp(buffer, { failOn: "error" }).rotate();
    const variants: Array<{ format: string; key: string; width?: number; height?: number; sizeBytes: number }> = [];
    for (const width of [640, 1280]) {
      const output = await image.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
      const variantKey = `images/${String(asset._id)}/${width}.webp`;
      await getR2Client().send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: variantKey, Body: output.data, ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable" }));
      variants.push({ format: "webp", key: variantKey, width: output.info.width, height: output.info.height, sizeBytes: output.info.size });
    }
    await UploadAssetModel.updateOne({ _id: asset._id }, { status: "ready", variants, $unset: { errorCode: 1, uploadId: 1 } });
  } catch (error) {
    console.error("Image processing failed", error);
    await UploadAssetModel.updateOne({ _id: asset._id }, { status: "failed", errorCode: "IMAGE_PROCESSING_FAILED" });
  }
}

export async function completeUpload(assetId: string, userId: unknown, parts: Array<{ ETag: string; PartNumber: number }>) {
  const asset = await UploadAssetModel.findOne({ _id: assetId, uploadedBy: userId }).select("+bucket +key +uploadId");
  if (!asset || !asset.uploadId) throw new AppError(404, "UPLOAD_NOT_FOUND", "Upload session not found");
  await getR2Client().send(new CompleteMultipartUploadCommand({ Bucket: asset.bucket, Key: asset.key, UploadId: asset.uploadId, MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) } }));
  const head = await getR2Client().send(new HeadObjectCommand({ Bucket: asset.bucket, Key: asset.key }));
  if (head.ContentLength !== asset.sizeBytes) {
    await UploadAssetModel.updateOne({ _id: asset._id }, { status: "failed", errorCode: "SIZE_MISMATCH" });
    throw new AppError(422, "UPLOAD_SIZE_MISMATCH", "Uploaded file size does not match the declared size");
  }
  if (asset.kind === "image") await processImage(String(asset._id));
  else await UploadAssetModel.updateOne({ _id: asset._id }, { status: "ready", $unset: { uploadId: 1 } });
  const ready = await UploadAssetModel.findById(asset._id).select("+bucket +key +variants.key");
  if (!ready) throw new AppError(404, "UPLOAD_NOT_FOUND", "Upload not found");
  if (ready.status !== "ready") throw new AppError(422, "UPLOAD_PROCESSING_FAILED", "The image could not be processed. Choose a valid image and retry");
  return serializeAsset(ready);
}

export async function cancelUpload(assetId: string, userId: unknown): Promise<void> {
  const asset = await UploadAssetModel.findOne({ _id: assetId, uploadedBy: userId }).select("+bucket +key +uploadId");
  if (!asset) throw new AppError(404, "UPLOAD_NOT_FOUND", "Upload session not found");
  if (asset.uploadId) await getR2Client().send(new AbortMultipartUploadCommand({ Bucket: asset.bucket, Key: asset.key, UploadId: asset.uploadId }));
  await asset.deleteOne();
}
