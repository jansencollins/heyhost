import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Import product metadata from a retailer URL.
 *
 * Works well for sites that expose OpenGraph or schema.org Product data.
 * Amazon's HTML often triggers their bot-detection when fetched server-side,
 * so this is best-effort for Amazon specifically — works reliably for most
 * other major retailers (Target, Walmart, Best Buy, Etsy, Shopify stores).
 */

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return null;
}

function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[^0-9.]/g, "");
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100);
}

function extractJsonLdProduct(html: string): {
  name?: string;
  image?: string;
  priceCents?: number;
} | null {
  const blocks = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!blocks) return null;

  for (const block of blocks) {
    const raw = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    // Flatten @graph arrays (common in Shopify/Shopware stores)
    const flat: unknown[] = [];
    for (const c of candidates) {
      if (c && typeof c === "object" && Array.isArray((c as { "@graph"?: unknown[] })["@graph"])) {
        flat.push(...((c as { "@graph": unknown[] })["@graph"] ?? []));
      } else {
        flat.push(c);
      }
    }

    for (const node of flat) {
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      const type = obj["@type"];
      const isProduct =
        type === "Product" || (Array.isArray(type) && type.includes("Product"));
      if (!isProduct) continue;

      const name = typeof obj.name === "string" ? obj.name : undefined;
      const imageField = obj.image;
      const image =
        typeof imageField === "string"
          ? imageField
          : Array.isArray(imageField) && typeof imageField[0] === "string"
            ? (imageField[0] as string)
            : undefined;

      const offers = obj.offers;
      let priceCents: number | null = null;
      if (offers) {
        const offerList = Array.isArray(offers) ? offers : [offers];
        for (const offer of offerList) {
          if (!offer || typeof offer !== "object") continue;
          const o = offer as Record<string, unknown>;
          priceCents =
            parsePrice(o.price) ??
            parsePrice(o.lowPrice) ??
            parsePrice((o.priceSpecification as Record<string, unknown> | undefined)?.price);
          if (priceCents !== null) break;
        }
      }

      if (name || image || priceCents !== null) {
        return {
          name,
          image,
          priceCents: priceCents ?? undefined,
        };
      }
    }
  }
  return null;
}

// Amazon-specific fallback when their page loads but lacks OG/JSON-LD.
//
// Price ordering matters: Amazon's HTML usually contains several prices
// (strikethrough list price, current price, deal price, Prime price, used).
// We prioritize the current/sale price first and deliberately skip the
// `a-text-price` class — that's typically the strikethrough "was" price.
function extractAmazonPrice(html: string): number | null {
  const patterns = [
    // Deal price, sale price, or main price block (classic Amazon IDs)
    /<span[^>]+id=["'](?:priceblock_dealprice|priceblock_saleprice|priceblock_ourprice|corePrice_feature_div)["'][^>]*>\s*\$?([0-9]+\.?[0-9]*)/i,
    // The "apex" price container — current price in the buy box
    /<div[^>]+id=["']corePriceDisplay[^>]*<span class=["']a-offscreen["']>\s*\$?([0-9]+\.?[0-9]*)/i,
    // Embedded priceAmount (most reliable on modern Amazon pages)
    /"priceAmount":\s*"?([0-9]+\.?[0-9]*)"?/i,
    // First a-offscreen (usually the current price in the buy box, before any strikethrough)
    /<span class=["']a-offscreen["']>\s*\$?([0-9]+\.?[0-9]*)\s*<\/span>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const n = parseFloat(m[1]);
      if (!isNaN(n)) return Math.round(n * 100);
    }
  }
  return null;
}

function extractAmazonTitle(html: string): string | null {
  const m = html.match(/<span[^>]+id="productTitle"[^>]*>([\s\S]*?)<\/span>/i);
  if (!m) return null;
  return decodeEntities(m[1].replace(/\s+/g, " ").trim());
}

// Amazon product image extractor — tries multiple fallbacks.
function extractAmazonImage(html: string): string | null {
  // `#landingImage` has a data-a-dynamic-image attribute with a JSON map
  // of urls → [width, height]. Prefer the largest we can find.
  const dyn = html.match(
    /<img[^>]+id=["']landingImage["'][^>]+data-a-dynamic-image=(?:&quot;|["'])(\{[^}]+\})(?:&quot;|["'])/i
  );
  if (dyn) {
    try {
      const decoded = decodeEntities(dyn[1]);
      const parsed = JSON.parse(decoded) as Record<string, [number, number]>;
      const entries = Object.entries(parsed);
      if (entries.length > 0) {
        // Sort descending by pixel area and take the biggest
        entries.sort(
          (a, b) => b[1][0] * b[1][1] - a[1][0] * a[1][1]
        );
        return entries[0][0];
      }
    } catch {
      /* fall through */
    }
  }

  // Embedded product image JSON — Amazon often serializes imageGalleryData
  const hiRes = html.match(/"hiRes"\s*:\s*"(https:[^"\\]+)"/);
  if (hiRes) return hiRes[1];

  const large = html.match(/"large"\s*:\s*"(https:[^"\\]+)"/);
  if (large) return large[1];

  // Direct <img src> on landingImage as last resort
  const direct = html.match(/<img[^>]+id=["']landingImage["'][^>]+src=["']([^"']+)["']/i);
  if (direct) return direct[1];

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    if (!/^https?:$/.test(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Only http(s) URLs are supported" }, { status: 400 });
    }

    const response = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `The retailer returned ${response.status}. Try pasting the data manually.` },
        { status: 502 }
      );
    }

    const html = await response.text();

    // Try OpenGraph first, then JSON-LD Product, then site-specific fallbacks.
    const ogTitle = extractMeta(html, "og:title");
    const ogImage = extractMeta(html, "og:image");
    const ogPrice = parsePrice(extractMeta(html, "product:price:amount"));

    const ld = extractJsonLdProduct(html);

    const isAmazon = /(?:^|\.)amazon\./i.test(parsedUrl.hostname);
    const amazonTitle = isAmazon ? extractAmazonTitle(html) : null;
    // For Amazon, prefer the Amazon-specific price first — OG/JSON-LD on
    // Amazon often reflect list/MSRP, not the current buy-box price.
    const amazonPrice = isAmazon ? extractAmazonPrice(html) : null;
    const amazonImage = isAmazon ? extractAmazonImage(html) : null;

    const name = ld?.name || ogTitle || amazonTitle || null;
    const image = isAmazon
      ? amazonImage || ogImage || ld?.image || null
      : ld?.image || ogImage || amazonImage || null;
    const priceCents = isAmazon
      ? amazonPrice ?? ld?.priceCents ?? ogPrice ?? null
      : ld?.priceCents ?? ogPrice ?? amazonPrice ?? null;

    if (!name && !image && priceCents === null) {
      return NextResponse.json(
        {
          error:
            "Couldn't extract product info from that page. The site may block automated requests. Try a direct product link or paste the fields manually.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      name: name || null,
      image: image || null,
      price: priceCents !== null ? priceCents / 100 : null,
      source: parsedUrl.hostname,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
