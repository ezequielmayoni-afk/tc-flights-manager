// Extract and parse all <script type="application/ld+json"> blocks from raw HTML.
// Malformed blocks are skipped (logged) rather than throwing, so a single bad
// block on a page never breaks discovery.

const LD_JSON_BLOCK =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

export function extractJsonLd(html: string): any[] {
  const results: any[] = []
  let match: RegExpExecArray | null

  // Reset lastIndex defensively (regex is module-scoped & global).
  LD_JSON_BLOCK.lastIndex = 0

  while ((match = LD_JSON_BLOCK.exec(html)) !== null) {
    const raw = match[1]
    try {
      results.push(JSON.parse(raw))
    } catch {
      console.warn('[jsonld] skipped malformed block')
    }
  }

  return results
}
