// functions/api/photo-file.ts

type Env = {
  PHOTOS: R2Bucket;
};

function badRequest(message: string) {
  return new Response(message, { status: 400 });
}

function notFound(message: string) {
  return new Response(message, { status: 404 });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key")?.trim();

    if (!key) {
      return badRequest("key が必要だよ");
    }

    const object = await env.PHOTOS.get(key);
    if (!object) {
      return notFound("画像が見つからないよ");
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=3600");

    return new Response(object.body, {
      headers,
    });
  } catch (error) {
    console.error(error);
    return new Response(
      error instanceof Error ? error.message : "photo fetch failed",
      { status: 500 },
    );
  }
};
