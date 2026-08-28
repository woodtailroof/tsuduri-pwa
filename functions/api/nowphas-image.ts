const NOWPHAS_GRAPH_BASE_URL =
  "https://nowphas.mlit.go.jp/PROG/web_disp_data/20min/505/yugiha_7d";

function toJstDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}${values.month}${values.day}`;
}

function graphUrl(dateKey: string) {
  return `${NOWPHAS_GRAPH_BASE_URL}/505_5_${dateKey}.png`;
}

export const onRequestGet: PagesFunction = async () => {
  const now = new Date();
  const previousDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateKeys = [toJstDateKey(now), toJstDateKey(previousDay)];

  try {
    for (const dateKey of dateKeys) {
      const upstream = await fetch(graphUrl(dateKey), {
        headers: {
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          referer: "https://nowphas.mlit.go.jp/yugiha_graph/505/7/",
        },
      });
      const contentType = upstream.headers.get("content-type") ?? "";

      if (!upstream.ok || !contentType.toLowerCase().startsWith("image/")) {
        continue;
      }

      const headers = new Headers();
      headers.set("content-type", contentType || "image/png");
      headers.set("cache-control", "public, max-age=300, s-maxage=300");
      headers.set("x-content-type-options", "nosniff");
      headers.set("x-nowphas-date", dateKey);

      return new Response(upstream.body, {
        status: 200,
        headers,
      });
    }

    return new Response("NOWPHASのグラフ画像を取得できませんでした", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[nowphas-image]", error);
    return new Response("NOWPHASのグラフ画像を取得できませんでした", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
};
