/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { PublicAsset, ThemeType } from "@shared/types";
import { ArrowLeft, CheckCircle2, FileArchive, Film, ImagePlus, Save, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorMessage } from "../../components/ui/error-message";
import { Spinner } from "../../components/ui/spinner";
import { useToast } from "../../context/toast-store";
import { useAsync } from "../../hooks/use-async";
import { api, ApiError } from "../../lib/api";

const blank = {
  name: "", slug: "", shortDescription: "", description: "", stack: "React, TypeScript",
  features: "Responsive layouts\nAccessible navigation\nSetup documentation", price: "49", currency: "USD",
  version: "1.0.0", previewUrl: "", changelog: "", setupInstructions: "", deployInstructions: "",
  featured: false, seoTitle: "", seoDescription: "",
};

type Fields = typeof blank;
type UploadKind = "image" | "video" | "theme_zip";
type ErrorKey = keyof Fields | "previewAssets" | "sourceAsset";
type FormErrors = Partial<Record<ErrorKey, string>>;
type UploadState = { kind: UploadKind; label: string; progress: number; phase: string };

const uploadRules: Record<UploadKind, { types: string[]; maxBytes: number; description: string }> = {
  image: { types: ["image/jpeg", "image/png", "image/webp", "image/avif"], maxBytes: 10 * 1024 * 1024, description: "JPG, PNG, WebP or AVIF up to 10 MB" },
  video: { types: ["video/mp4", "video/webm"], maxBytes: 250 * 1024 * 1024, description: "MP4 or WebM up to 250 MB" },
  theme_zip: { types: ["application/zip", "application/x-zip", "application/x-zip-compressed", "application/octet-stream"], maxBytes: 100 * 1024 * 1024, description: "ZIP package up to 100 MB" },
};

function fieldErrorProps(name: ErrorKey, errors: FormErrors) {
  return { "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${name}-error` : undefined };
}

function FieldError({ name, errors }: { name: ErrorKey; errors: FormErrors }) {
  return errors[name] ? <small className="field-error" id={`${name}-error`}>{errors[name]}</small> : null;
}

function validateFile(file: File, kind: UploadKind): string | undefined {
  const rule = uploadRules[kind];
  const isZip = kind === "theme_zip" && file.name.toLowerCase().endsWith(".zip");
  if (!rule.types.includes(file.type) && !isZip) return `Choose a supported ${kind === "theme_zip" ? "ZIP" : kind} file`;
  if (file.size <= 0) return "The selected file is empty";
  if (file.size > rule.maxBytes) return `The file exceeds the ${Math.round(rule.maxBytes / 1024 / 1024)} MB limit`;
  return undefined;
}

async function uploadAsset(file: File, kind: UploadKind, update: (progress: number, phase: string) => void): Promise<PublicAsset> {
  let assetId: string | undefined;
  try {
    update(5, "Preparing upload");
    const init = await api.post<{ asset: PublicAsset; uploadId: string; partSizeBytes: number }>("/admin/uploads/initiate", {
      kind, originalName: file.name,
      contentType: file.type || (kind === "theme_zip" ? "application/zip" : "application/octet-stream"),
      sizeBytes: file.size,
    });
    assetId = init.asset.id;
    const parts: Array<{ ETag: string; PartNumber: number }> = [];
    const count = Math.ceil(file.size / init.partSizeBytes);

    for (let index = 0; index < count; index++) {
      const partNumber = index + 1;
      update(10 + Math.round(index / count * 80), count > 1 ? `Uploading part ${partNumber} of ${count}` : "Uploading to Cloudflare R2");
      const part = file.slice(index * init.partSizeBytes, Math.min(file.size, (index + 1) * init.partSizeBytes));
      const { ETag } = await api.uploadPart(`/admin/uploads/${assetId}/parts/${partNumber}`, part);
      parts.push({ ETag, PartNumber: partNumber });
      update(10 + Math.round(partNumber / count * 80), count > 1 ? `Uploaded part ${partNumber} of ${count}` : "Upload transferred");
    }

    update(95, kind === "image" ? "Optimizing image" : "Verifying upload");
    const asset = await api.post<PublicAsset>(`/admin/uploads/${assetId}/complete`, { parts });
    update(100, "Upload complete");
    return asset;
  } catch (error) {
    if (assetId) await api.delete(`/admin/uploads/${assetId}`).catch(() => undefined);
    if (error instanceof TypeError) throw new Error("The upload service could not be reached. Check your connection and retry");
    throw error;
  }
}

function validateTheme(fields: Fields, images: PublicAsset[], videos: PublicAsset[], source?: PublicAsset): FormErrors {
  const errors: FormErrors = {};
  const name = fields.name.trim();
  const slug = fields.slug.trim();
  const price = Number(fields.price);
  const stack = fields.stack.split(",").map((value) => value.trim()).filter(Boolean);
  const features = fields.features.split("\n").map((value) => value.trim()).filter(Boolean);

  if (name.length < 2) errors.name = "Enter a name with at least 2 characters";
  else if (name.length > 100) errors.name = "Name cannot exceed 100 characters";
  if (slug.length < 2) errors.slug = "Enter a slug with at least 2 characters";
  else if (slug.length > 100) errors.slug = "Slug cannot exceed 100 characters";
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.slug = "Use lowercase letters, numbers, and single hyphens only";
  if (fields.shortDescription.trim().length < 10) errors.shortDescription = "Enter at least 10 characters";
  else if (fields.shortDescription.trim().length > 240) errors.shortDescription = "Short description cannot exceed 240 characters";
  if (fields.description.trim().length < 20) errors.description = "Enter at least 20 characters";
  else if (fields.description.length > 20_000) errors.description = "Description cannot exceed 20,000 characters";
  if (!Number.isFinite(price) || price < 0) errors.price = "Enter a valid price of 0 or more";
  else if (price > 1_000_000) errors.price = "Price cannot exceed 1,000,000";
  if (!/^[A-Z]{3}$/.test(fields.currency.trim())) errors.currency = "Use a 3-letter currency code such as USD";
  if (!fields.version.trim()) errors.version = "Enter the theme version";
  else if (fields.version.trim().length > 30) errors.version = "Version cannot exceed 30 characters";
  if (!stack.length) errors.stack = "Add at least one technology";
  else if (stack.length > 20) errors.stack = "Add no more than 20 technologies";
  else if (stack.some((value) => value.length > 40)) errors.stack = "Each technology must be 40 characters or fewer";
  if (!features.length) errors.features = "Add at least one feature";
  else if (features.length > 30) errors.features = "Add no more than 30 features";
  else if (features.some((value) => value.length > 160)) errors.features = "Each feature must be 160 characters or fewer";

  try {
    const preview = new URL(fields.previewUrl);
    const host = preview.hostname.toLowerCase();
    const privateHost = host === "localhost" || host.startsWith("127.") || host === "0.0.0.0" || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (preview.protocol !== "https:" || privateHost) errors.previewUrl = "Enter a public HTTPS preview URL";
  } catch {
    errors.previewUrl = "Enter a valid public HTTPS preview URL";
  }

  if (fields.seoTitle.length > 70) errors.seoTitle = "SEO title cannot exceed 70 characters";
  if (fields.seoDescription.length > 170) errors.seoDescription = "SEO description cannot exceed 170 characters";
  if (fields.setupInstructions.length > 20_000) errors.setupInstructions = "Setup instructions cannot exceed 20,000 characters";
  if (fields.deployInstructions.length > 20_000) errors.deployInstructions = "Deployment instructions cannot exceed 20,000 characters";
  if (fields.changelog.length > 20_000) errors.changelog = "Changelog cannot exceed 20,000 characters";
  if (![...images, ...videos].some((asset) => asset.status === "ready")) errors.previewAssets = "Upload at least one preview image or video";
  if (!source || source.status !== "ready") errors.sourceAsset = "Upload the required source ZIP file";
  return errors;
}

function mapServerErrors(error: unknown): FormErrors {
  const errors: FormErrors = {};
  if (!(error instanceof ApiError)) return errors;
  const fieldMap: Record<string, ErrorKey> = { priceMinor: "price", imageAssetIds: "previewAssets", videoAssetIds: "previewAssets", previewAssets: "previewAssets", sourceAssetId: "sourceAsset" };
  for (const issue of error.validationErrors ?? []) {
    if (!issue || typeof issue !== "object") continue;
    const candidate = issue as { path?: unknown[]; message?: string };
    const rawName = String(candidate.path?.[0] ?? "");
    const name = fieldMap[rawName] ?? rawName as ErrorKey;
    if (name in blank || name === "previewAssets" || name === "sourceAsset") errors[name] = candidate.message ?? "Check this field";
  }
  if (error.code === "THEME_PREVIEW_REQUIRED") errors.previewAssets = error.message;
  if (error.code === "THEME_SOURCE_REQUIRED") errors.sourceAsset = error.message;
  return errors;
}

function UploadProgress({ upload }: { upload: UploadState }) {
  return <div className="upload-progress" aria-live="polite"><div><UploadCloud size={16} /><span><strong>{upload.label}</strong><small>{upload.phase}</small></span><b>{upload.progress}%</b></div><progress value={upload.progress} max="100" aria-label={`${upload.label} upload progress`} /></div>;
}

export default function AdminThemeEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const request = useAsync<ThemeType>();
  const save = useAsync<ThemeType>();
  const [fields, setFields] = useState<Fields>(blank);
  const [images, setImages] = useState<PublicAsset[]>([]);
  const [videos, setVideos] = useState<PublicAsset[]>([]);
  const [source, setSource] = useState<PublicAsset | undefined>();
  const [uploading, setUploading] = useState<UploadState | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const previewReady = useMemo(() => [...images, ...videos].some((asset) => asset.status === "ready"), [images, videos]);

  useEffect(() => {
    if (!id) return;
    void request.run(api.get<ThemeType>(`/admin/themes/${id}`)).then((theme) => {
      setFields({ name: theme.name, slug: theme.slug, shortDescription: theme.shortDescription, description: theme.description, stack: theme.stack.join(", "), features: theme.features.join("\n"), price: String(theme.priceMinor / 100), currency: theme.currency, version: theme.version, previewUrl: theme.previewUrl, changelog: theme.changelog ?? "", setupInstructions: theme.setupInstructions ?? "", deployInstructions: theme.deployInstructions ?? "", featured: theme.featured, seoTitle: theme.seoTitle ?? "", seoDescription: theme.seoDescription ?? "" });
      setImages(theme.images); setVideos(theme.videos); setSource(theme.sourceAsset);
    }).catch(() => undefined);
  }, [id, request.run]);

  const clearError = (name: ErrorKey) => setErrors((current) => { const next = { ...current }; delete next[name]; return next; });
  const field = (name: keyof Fields, value: string | boolean) => { setFields((current) => ({ ...current, [name]: value })); clearError(name); };

  const selectFile = async (file: File | undefined, kind: UploadKind) => {
    if (!file || uploading) return;
    const errorKey: ErrorKey = kind === "theme_zip" ? "sourceAsset" : "previewAssets";
    const fileError = validateFile(file, kind);
    if (fileError) { setErrors((current) => ({ ...current, [errorKey]: fileError })); return; }
    clearError(errorKey);
    setUploading({ kind, label: file.name, progress: 0, phase: "Starting" });
    try {
      const asset = await uploadAsset(file, kind, (progress, phase) => setUploading({ kind, label: file.name, progress, phase }));
      if (kind === "image") setImages((items) => [...items, asset]);
      else if (kind === "video") setVideos((items) => [...items, asset]);
      else setSource(asset);
      notify(`${file.name} uploaded`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setErrors((current) => ({ ...current, [errorKey]: message }));
      notify(message, "error");
    } finally { setUploading(null); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationErrors = validateTheme(fields, images, videos, source);
    setErrors(validationErrors);
    const firstError = Object.keys(validationErrors)[0] as ErrorKey | undefined;
    if (firstError) { requestAnimationFrame(() => document.querySelector<HTMLElement>(`[aria-describedby="${firstError}-error"]`)?.focus()); return; }

    const body = { ...fields, stack: fields.stack.split(",").map((value) => value.trim()).filter(Boolean), features: fields.features.split("\n").map((value) => value.trim()).filter(Boolean), priceMinor: Math.round(Number(fields.price) * 100), imageAssetIds: images.map((asset) => asset.id), videoAssetIds: videos.map((asset) => asset.id), sourceAssetId: source!.id, changelog: fields.changelog || undefined, setupInstructions: fields.setupInstructions || undefined, deployInstructions: fields.deployInstructions || undefined, seoTitle: fields.seoTitle || undefined, seoDescription: fields.seoDescription || undefined };
    try {
      const theme = await save.run(id ? api.put<ThemeType>(`/admin/themes/${id}`, body) : api.post<ThemeType>("/admin/themes", body));
      notify(id ? "Theme updated" : "Draft theme created");
      navigate(`/admin/themes/${theme.id}/edit`, { replace: true });
    } catch (error) {
      const serverErrors = mapServerErrors(error);
      if (Object.keys(serverErrors).length) setErrors((current) => ({ ...current, ...serverErrors }));
    }
  };

  if (request.isLoading && id) return <main className="admin-page"><div className="page-loader"><Spinner size="md" /></div></main>;
  const busy = save.isLoading || Boolean(uploading);

  return <main className="admin-page">
    <Link className="back-link" to="/admin/themes"><ArrowLeft size={16} />Theme library</Link>
    <div className="editor-heading"><div><span className="eyebrow">Catalog editor</span><h1>{id ? "Edit theme" : "Create a theme"}</h1><p>Add a preview image or video and the private source ZIP before saving the theme.</p></div></div>
    {(request.error || save.error) && <ErrorMessage message={(request.error || save.error)!} onDismiss={() => { request.clearError(); save.clearError(); }} />}
    <form className="theme-editor" onSubmit={submit} noValidate>
      <section className="editor-main">
        <div className="editor-section"><h2>Identity and story</h2><div className="form-grid">
          <label>Name <span className="field-required">Required</span><input {...fieldErrorProps("name", errors)} value={fields.name} onChange={(event) => { field("name", event.target.value); if (!id) field("slug", event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} /><FieldError name="name" errors={errors} /></label>
          <label>Slug <span className="field-required">Required</span><input {...fieldErrorProps("slug", errors)} value={fields.slug} onChange={(event) => field("slug", event.target.value)} /><FieldError name="slug" errors={errors} /></label>
          <label className="full">Short description <span className="field-required">Required</span><input {...fieldErrorProps("shortDescription", errors)} maxLength={240} value={fields.shortDescription} onChange={(event) => field("shortDescription", event.target.value)} /><FieldError name="shortDescription" errors={errors} /></label>
          <label className="full">Full description <span className="field-required">Required</span><textarea {...fieldErrorProps("description", errors)} rows={7} value={fields.description} onChange={(event) => field("description", event.target.value)} /><FieldError name="description" errors={errors} /></label>
        </div></div>

        <div className="editor-section"><h2>Product details</h2><div className="form-grid">
          <label>Price <span className="field-required">Required</span><input {...fieldErrorProps("price", errors)} type="number" min="0" step="0.01" value={fields.price} onChange={(event) => field("price", event.target.value)} /><FieldError name="price" errors={errors} /></label>
          <label>Currency <span className="field-required">Required</span><input {...fieldErrorProps("currency", errors)} maxLength={3} value={fields.currency} onChange={(event) => field("currency", event.target.value.toUpperCase())} /><FieldError name="currency" errors={errors} /></label>
          <label>Version <span className="field-required">Required</span><input {...fieldErrorProps("version", errors)} value={fields.version} onChange={(event) => field("version", event.target.value)} /><FieldError name="version" errors={errors} /></label>
          <label>Stack, comma separated <span className="field-required">Required</span><input {...fieldErrorProps("stack", errors)} value={fields.stack} onChange={(event) => field("stack", event.target.value)} /><FieldError name="stack" errors={errors} /></label>
          <label className="full">Features, one per line <span className="field-required">Required</span><textarea {...fieldErrorProps("features", errors)} rows={6} value={fields.features} onChange={(event) => field("features", event.target.value)} /><FieldError name="features" errors={errors} /></label>
          <label className="full">Public HTTPS preview URL <span className="field-required">Required</span><input {...fieldErrorProps("previewUrl", errors)} type="url" value={fields.previewUrl} onChange={(event) => field("previewUrl", event.target.value)} placeholder="https://preview.example.com" /><FieldError name="previewUrl" errors={errors} /></label>
        </div></div>

        <div className="editor-section"><h2>Documentation</h2><div className="form-grid">
          <label className="full">Setup instructions<textarea {...fieldErrorProps("setupInstructions", errors)} rows={6} value={fields.setupInstructions} onChange={(event) => field("setupInstructions", event.target.value)} /><FieldError name="setupInstructions" errors={errors} /></label>
          <label className="full">Deployment instructions<textarea {...fieldErrorProps("deployInstructions", errors)} rows={5} value={fields.deployInstructions} onChange={(event) => field("deployInstructions", event.target.value)} /><FieldError name="deployInstructions" errors={errors} /></label>
          <label className="full">Changelog<textarea {...fieldErrorProps("changelog", errors)} rows={4} value={fields.changelog} onChange={(event) => field("changelog", event.target.value)} /><FieldError name="changelog" errors={errors} /></label>
        </div></div>
      </section>

      <aside className="editor-side">
        <div className="editor-section asset-section">
          <div className="asset-section-heading"><div><h2>Theme assets</h2><p>Both requirements must be complete.</p></div><span className={previewReady && source?.status === "ready" ? "complete" : ""}>{Number(previewReady) + Number(source?.status === "ready")} / 2</span></div>
          <div className={`asset-requirement ${previewReady ? "met" : ""}`}><CheckCircle2 size={16} /><span>Preview image or video</span><b>Required</b></div>
          <button type="button" disabled={busy} className={`upload-drop ${errors.previewAssets ? "invalid" : ""}`} {...fieldErrorProps("previewAssets", errors)} onClick={() => imageInputRef.current?.click()}><ImagePlus size={24} /><strong>Add preview image</strong><span>{uploadRules.image.description}</span></button>
          <input ref={imageInputRef} className="asset-file-input" disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void selectFile(file, "image"); }} />
          {uploading?.kind === "image" && <UploadProgress upload={uploading} />}
          {images.map((asset) => <div className="asset-row" key={asset.id}><span>{asset.url ? <img src={asset.url} alt="" /> : <ImagePlus />}</span><div><strong>{asset.originalName}</strong><small>{asset.status}</small></div><button type="button" disabled={busy} onClick={() => { const next = images.filter((item) => item.id !== asset.id); setImages(next); if (!next.some((item) => item.status === "ready") && !videos.some((item) => item.status === "ready")) setErrors((current) => ({ ...current, previewAssets: "Upload at least one preview image or video" })); }}>Remove</button></div>)}
          <button type="button" disabled={busy} className={`upload-drop source ${errors.previewAssets ? "invalid" : ""}`} {...fieldErrorProps("previewAssets", errors)} onClick={() => videoInputRef.current?.click()}><Film size={24} /><strong>Add preview video</strong><span>{uploadRules.video.description}</span></button>
          <input ref={videoInputRef} className="asset-file-input" disabled={busy} type="file" accept="video/mp4,video/webm" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void selectFile(file, "video"); }} />
          {uploading?.kind === "video" && <UploadProgress upload={uploading} />}
          {videos.map((asset) => <div className="asset-row" key={asset.id}><span>{asset.url ? <video src={asset.url} muted /> : <Film />}</span><div><strong>{asset.originalName}</strong><small>{asset.status}</small></div><button type="button" disabled={busy} onClick={() => { const next = videos.filter((item) => item.id !== asset.id); setVideos(next); if (!next.some((item) => item.status === "ready") && !images.some((item) => item.status === "ready")) setErrors((current) => ({ ...current, previewAssets: "Upload at least one preview image or video" })); }}>Remove</button></div>)}
          <FieldError name="previewAssets" errors={errors} />

          <div className={`asset-requirement source-requirement ${source?.status === "ready" ? "met" : ""}`}><CheckCircle2 size={16} /><span>Theme source package</span><b>Required</b></div>
          <button type="button" disabled={busy} className={`upload-drop source ${errors.sourceAsset ? "invalid" : ""}`} {...fieldErrorProps("sourceAsset", errors)} onClick={() => sourceInputRef.current?.click()}><FileArchive size={24} /><strong>{source ? "Replace source ZIP" : "Upload source ZIP"}</strong><span>{source?.originalName ?? uploadRules.theme_zip.description}</span></button>
          <input ref={sourceInputRef} className="asset-file-input" disabled={busy} type="file" accept=".zip,application/zip,application/x-zip,application/x-zip-compressed" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void selectFile(file, "theme_zip"); }} />
          {uploading?.kind === "theme_zip" && <UploadProgress upload={uploading} />}
          {source && <div className="asset-row source-file"><span><FileArchive /></span><div><strong>{source.originalName}</strong><small>{source.status}</small></div><button type="button" disabled={busy} onClick={() => { setSource(undefined); setErrors((current) => ({ ...current, sourceAsset: "Upload the required source ZIP file" })); }}>Remove</button></div>}
          <FieldError name="sourceAsset" errors={errors} />
        </div>

        <div className="editor-section"><h2>Presentation</h2>
          <label className="check-label"><input type="checkbox" checked={fields.featured} onChange={(event) => field("featured", event.target.checked)} />Feature on the home page</label>
          <label>SEO title<input {...fieldErrorProps("seoTitle", errors)} value={fields.seoTitle} maxLength={70} onChange={(event) => field("seoTitle", event.target.value)} /><FieldError name="seoTitle" errors={errors} /></label>
          <label>SEO description<textarea {...fieldErrorProps("seoDescription", errors)} rows={3} maxLength={170} value={fields.seoDescription} onChange={(event) => field("seoDescription", event.target.value)} /><FieldError name="seoDescription" errors={errors} /></label>
        </div>
        <button type="submit" className="primary-button editor-save" disabled={busy}>{save.isLoading ? <Spinner size="sm" /> : <Save size={17} />}{id ? "Save changes" : "Create draft"}</button>
      </aside>
    </form>
  </main>;
}
