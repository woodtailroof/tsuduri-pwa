// functions/tide736/get_tide.php.ts
// Cloudflare Pages Functions
//
// フロントは /tide736/get_tide.php を叩く
// 本番ではここが受けて、tide736 の JSON API (api.tide736.net/get_tide.php) に中継する

export const onRequestGet: PagesFunction = async (context) => {
  const reqUrl = new URL(context.request.url)
  const qs = reqUrl.searchParams.toString()

  // ✅ 環境変数は API ドメインを入れるのが正解
  // TIDE736_ORIGIN = https://api.tide736.net
  const upstreamOrigin =
    (context.env as any)?.TIDE736_ORIGIN?.toString()?.trim() || 'https://api.tide736.net'

  // ✅ ここが重要：上流パスは /get_tide.php（/tide736/get_tide.php ではない）
  const upstreamUrl = `${upstreamOrigin.replace(/\/+$/, '')}/get_tide.php${qs ? `?${qs}` : ''}`

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; tsuduri-pwa/1.0; +https://pages.dev)',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json(
      {
        status: false,
        error: `tide736 upstream fetch failed: ${msg}`,
        upstreamUrl,
      },
      502
    )
  }

  const ct = upstreamRes.headers.get('content-type') || ''
  const text = await upstreamRes.text()

  if (!upstreamRes.ok) {
    return json(
      {
        status: false,
        error: `tide736 upstream HTTP ${upstreamRes.status}`,
        upstreamUrl,
        contentType: ct,
        bodyHead: text.slice(0, 200),
      },
      502
    )
  }

  // content-type が怪しくても JSON のことがあるので parse を試す
  if (!ct.includes('json')) {
    try {
      const parsed = JSON.parse(text)
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=300',
        },
      })
    } catch {
      return json(
        {
          status: false,
          error: 'tide736 upstream returned non-JSON',
          upstreamUrl,
          contentType: ct,
          bodyHead: text.slice(0, 200),
        },
        502
      )
    }
  }

  return new Response(text, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
