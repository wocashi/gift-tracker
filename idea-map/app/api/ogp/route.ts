import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IdeaMap/1.0; +bot)" },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();

    const get = (patterns: RegExp[]) => {
      for (const p of patterns) {
        const m = html.match(p);
        if (m?.[1]) return m[1].trim();
      }
      return null;
    };

    const title = get([
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]);

    const description = get([
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i,
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i,
    ]);

    const image = get([
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    ]);

    const siteName = get([
      /<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i,
    ]) ?? new URL(url).hostname;

    // 相対URLを絶対URLに変換
    let resolvedImage = image;
    if (image && !image.startsWith("http")) {
      const base = new URL(url);
      resolvedImage = new URL(image, base.origin).href;
    }

    return NextResponse.json({ url, title: title ?? url, description: description ?? "", image: resolvedImage, siteName });
  } catch {
    return NextResponse.json({ url, title: url, description: "", image: null, siteName: new URL(url).hostname });
  }
}
