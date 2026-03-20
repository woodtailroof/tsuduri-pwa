// functions/api/photo-upload.ts

type Env = {
  PHOTOS: R2Bucket;
};

type UploadSuccess = {
  ok: true;
  photoUid: string;
  tripUid: string;
  remoteKey: string;
  contentType: string;
  size: number;
};

type UploadError = {
  ok: false;
  error: string;
};

function json(data: UploadSuccess | UploadError, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    ...init,
  });
}

function badRequest(message: string) {
  return json({ ok: false, error: message }, { status: 400 });
}

function serverError(message: string) {
  return json({ ok: false, error: message }, { status: 500 });
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "image";
  return trimmed
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function detectExtension(contentType: string, originalName: string): string {
  const lower = originalName.toLowerCase();

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".webp")) return "webp";
  if (lower.endsWith(".gif")) return "gif";
  if (lower.endsWith(".heic")) return "heic";
  if (lower.endsWith(".heif")) return "heif";

  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "bin";
  }
}

function buildRemoteKey(params: {
  tripUid: string;
  photoUid: string;
  fileName: string;
  contentType: string;
}) {
  const safeName = sanitizeFileName(params.fileName || "image");
  const ext = detectExtension(params.contentType, safeName);
  const baseName = safeName.replace(/\.[^.]+$/, "") || "image";

  return `trip-photos/${params.tripUid}/${params.photoUid}/${baseName}.${ext}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return badRequest("multipart/form-data で送ってね");
    }

    const form = await request.formData();

    const photoUid = String(form.get("photoUid") || "").trim();
    const tripUid = String(form.get("tripUid") || "").trim();
    const fileValue = form.get("file");

    if (!photoUid) {
      return badRequest("photoUid が必要だよ");
    }
    if (!tripUid) {
      return badRequest("tripUid が必要だよ");
    }
    if (!(fileValue instanceof File)) {
      return badRequest("file が必要だよ");
    }

    if (!fileValue.type.startsWith("image/")) {
      return badRequest("画像ファイルだけ送れるよ");
    }

    if (fileValue.size <= 0) {
      return badRequest("空のファイルは送れないよ");
    }

    // ひとまず 15MB 上限
    if (fileValue.size > 15 * 1024 * 1024) {
      return badRequest("画像が大きすぎるよ（15MBまで）");
    }

    const remoteKey = buildRemoteKey({
      tripUid,
      photoUid,
      fileName: fileValue.name || "image",
      contentType: fileValue.type || "application/octet-stream",
    });

    await env.PHOTOS.put(remoteKey, fileValue.stream(), {
      httpMetadata: {
        contentType: fileValue.type || "application/octet-stream",
      },
      customMetadata: {
        photoUid,
        tripUid,
        originalName: fileValue.name || "",
      },
    });

    return json({
      ok: true,
      photoUid,
      tripUid,
      remoteKey,
      contentType: fileValue.type || "application/octet-stream",
      size: fileValue.size,
    });
  } catch (error) {
    console.error(error);
    return serverError(
      error instanceof Error ? error.message : "upload failed",
    );
  }
};
