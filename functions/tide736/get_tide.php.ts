// functions/tide736/get_tide.php.ts
// Cloudflare Pages Functions
//
// 目的：フロントが /tide736/get_tide.php にアクセスしても、
// 本番でちゃんと tide736 本家へ転送して JSON を返す（Vite proxy の本番版）

export const onRequestGet: PagesFunction = async (context) => {
  const reqUrl = new URL(context.request.url)

  // クエリはそのまま転送（pc/hc/yr/mn/dy/rg など）
  const qs = reqUrl.searchParams.toString()

  // ✅ 上流（本家）のURLは環境変数で差し替え可能にする
  // Cloudflare Pages → Settings → Environment variables
  // TIDE736_ORIGIN = https://tide736.net   のように設定
  const upstreamOrigin =
    (context.env as any)?.TIDE736_ORIGIN?.toString()?.trim() || 'https://tide736.net'

  const upstreamUrl = `${upstreamOrigin.replace(/\/+$/, '')}/tide736/get_tide.php${
    qs ? `?${qs}` : ''
  }`

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        // 本家がUAなどで弾くケースの保険
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

  // 上流がエラー or HTML を返した時に、フロント側で分かる形にして返す
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

  // JSONを期待してるので、HTMLっぽかったら明示的に弾く
  if (!ct.includes('json')) {
    // text が JSON だったとしても content-type が変な場合もあるので parse を試す
    try {
      const parsed = JSON.parse(text)
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=300', // 5分キャッシュ（好みで調整OK）
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

  // 通常：上流のJSONをそのまま返す
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
