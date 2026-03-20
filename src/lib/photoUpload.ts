// src/lib/photoUpload.ts

type PhotoUploadSuccessResponse = {
  ok: true;
  photoUid: string;
  tripUid: string;
  remoteKey: string;
  contentType: string;
  size: number;
};

type PhotoUploadErrorResponse = {
  ok: false;
  error: string;
};

type PhotoUploadResponse =
  | PhotoUploadSuccessResponse
  | PhotoUploadErrorResponse;

export type UploadResult =
  | {
      ok: true;
      remoteKey: string;
    }
  | {
      ok: false;
      error: string;
    };

function isPhotoUploadResponse(value: unknown): value is PhotoUploadResponse {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;
  if (typeof v.ok !== "boolean") return false;

  if (v.ok === true) {
    return typeof v.remoteKey === "string";
  }

  return typeof v.error === "string";
}

export async function uploadPhoto(params: {
  photoUid: string;
  tripUid: string;
  file: Blob;
  fileName?: string;
}): Promise<UploadResult> {
  try {
    const form = new FormData();

    form.append("photoUid", params.photoUid);
    form.append("tripUid", params.tripUid);

    const file = new File([params.file], params.fileName || "image.jpg", {
      type: params.file.type || "image/jpeg",
    });

    form.append("file", file);

    const res = await fetch("/api/photo-upload", {
      method: "POST",
      body: form,
    });

    const raw: unknown = await res.json();

    if (!isPhotoUploadResponse(raw)) {
      return {
        ok: false,
        error: "upload response invalid",
      };
    }

    if (!res.ok || !raw.ok) {
      return {
        ok: false,
        error: raw.ok ? "upload failed" : raw.error,
      };
    }

    return {
      ok: true,
      remoteKey: raw.remoteKey,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "upload error",
    };
  }
}
