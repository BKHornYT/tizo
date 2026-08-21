/**
 * Finds the *player* on a page that does not contain one yet.
 *
 * A large class of aggregator sites never render an `<iframe>` until the user
 * picks a player. The markup is stashed HTML-entity-encoded inside a `data-*`
 * attribute and injected on click:
 *
 *   <a class="js-server-embed"
 *      data-embed="&lt;iframe src=&#34;https://host.example/e/HASH&#34;…">
 *      <span>Player 1</span>
 *
 * Until that click the page shows a poster and "select a player above". The
 * regex scanner in scrape.ts looks for real `<iframe>`, `<video>` and `<source>`
 * elements, so it correctly reports finding nothing — the URL is right there,
 * just escaped inside an attribute value.
 *
 * Pure and free of electron imports so it can be asserted on directly.
 */

/** Paths that a video embed URL essentially always uses. */
const EMBED_PATH = /\/(e|embed|v|f|player|iframe)\/[A-Za-z0-9._-]{4,}/i

/**
 * Hosts whose iframes are never the video. Without this the first "embed" found
 * on a typical page is a consent frame or a share button, and following it wastes
 * a page load to learn nothing.
 */
const NOT_A_PLAYER =
  /(^|\.)(google|googletagmanager|doubleclick|googlesyndication|gstatic|recaptcha|facebook|connect\.facebook|twitter|x|platform\.twitter|instagram|disqus|zendesk|intercom|hotjar|cloudflareinsights|challenges\.cloudflare)\./i

export interface FoundEmbed {
  url: string
  /** Visible text near the link, e.g. "Player 2" — shown so a choice is legible. */
  label: string | null
}

/**
 * Decodes the HTML entities that matter here.
 *
 * Deliberately not a general-purpose decoder: the input is an attribute value
 * holding markup, and the only escapes that appear in practice are these five
 * plus numeric ones. `&amp;` is decoded last so `&amp;lt;` does not become `<`.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
}

/** Resolves protocol-relative and root-relative URLs against the page. */
function absolute(url: string, pageUrl: string): string | null {
  try {
    if (url.startsWith('//')) return new URL(`https:${url}`).toString()
    return new URL(url, pageUrl).toString()
  } catch {
    return null
  }
}

function usable(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (NOT_A_PLAYER.test(parsed.hostname)) return false
    return EMBED_PATH.test(parsed.pathname)
  } catch {
    return false
  }
}

/**
 * Every plausible player URL on the page, in document order and de-duplicated.
 *
 * Covers three shapes, because sites use all three:
 *  - a real `<iframe src>`
 *  - markup escaped inside any `data-*` attribute (the click-to-load case)
 *  - a bare embed URL sitting in a `data-*` attribute with no markup around it
 *
 * Document order is kept deliberately: "Player 1" is listed first because the
 * site listed it first, and that is usually the one the site prefers.
 */
export function findEmbeds(html: string, pageUrl: string): FoundEmbed[] {
  const out: FoundEmbed[] = []
  const seen = new Set<string>()

  const add = (raw: string, label: string | null): void => {
    const url = absolute(raw.trim(), pageUrl)
    if (!url || !usable(url) || seen.has(url)) return
    seen.add(url)
    out.push({ url, label })
  }

  // 1. Real iframes.
  for (const m of html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)) {
    add(m[1] ?? '', null)
  }

  /*
   * 2 and 3. Anything in a data-* attribute. The whole element is captured so a
   * nearby label ("Player 1") can be read out of the same tag or the text that
   * follows it — a bare list of hashes is not a choice anyone can make.
   */
  for (const m of html.matchAll(/<([a-z]+)\b([^>]*\sdata-[a-z-]+=(?:"[^"]*"|'[^']*')[^>]*)>/gi)) {
    const attrs = m[2] ?? ''
    // The label is the link's text, but it is rarely the first thing inside it —
    // these buttons usually open with an <svg> icon, so tags are stripped rather
    // than matched around.
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 400)
    const text = decodeEntities(after.split(/<\/(?:a|div|li)>/i)[0] ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const label =
      (text.length > 0 && text.length <= 40 ? text : null) ??
      attrs.match(/\stitle=["']([^"']{1,40})["']/i)?.[1] ??
      null

    for (const attr of attrs.matchAll(/\sdata-[a-z-]+=(?:"([^"]*)"|'([^']*)')/gi)) {
      const value = decodeEntities(attr[1] ?? attr[2] ?? '')
      if (!value) continue

      const iframe = [...value.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)]
      if (iframe.length > 0) {
        for (const f of iframe) add(f[1] ?? '', label)
        continue
      }
      // A bare URL in the attribute, with no markup wrapped around it.
      if (/^(https?:)?\/\//i.test(value) && !/\s/.test(value)) add(value, label)
    }
  }

  return out
}
