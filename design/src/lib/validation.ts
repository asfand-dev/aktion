import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120),
});

/** 8 MB cap on the serialized document — plenty for design JSON. */
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

const documentSchema = z
  .object({
    version: z.literal(1),
    theme: z.string().max(64),
    pages: z.array(z.unknown()).max(200),
    symbols: z.array(z.unknown()).max(500),
  })
  .passthrough()
  .refine((doc) => JSON.stringify(doc).length <= MAX_DOCUMENT_BYTES, {
    message: "Document too large",
  });

export const projectPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    document: documentSchema.optional(),
    /** Small data-URL PNG for the dashboard card. */
    thumbnail: z
      .string()
      .regex(/^data:image\/(png|jpeg|webp);base64,/)
      .max(400_000)
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty patch" });

export const shareCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  canEdit: z.boolean().default(true),
});

export const sharePatchSchema = z.object({
  canEdit: z.boolean(),
});

export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ASSET_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);
