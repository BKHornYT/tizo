/**
 * Strips anything that could identify a person or a specific video.
 * Used by feedback.ts for every report body; kept free of electron imports so
 * scripts/test-auth.ts can run it under plain Node.
 *
 * yt-dlp's stderr routinely contains the full URL — which for a private or paid
 * video is exactly the thing that must not end up in a public issue tracker.
 * Paths are scrubbed too, since they carry the Windows username.
 */
export function sanitise(text: string): string {
  return text
    // A signed-in download runs with a temporary cookie file (src/main/auth).
    // Its path names the session file, and any header- or cookie-shaped line
    // could carry the session itself, so both go before anything else runs.
    .replace(/\S*tizo-cookies-[0-9a-f-]+\.txt/gi, '[cookie file removed]')
    .replace(/^.*\b(?:set-cookie|cookie|cookies|authorization|auth_token|sessionid|x-csrf-token)\b\s*[:=].*$/gim, '[line removed]')
    .replace(/https?:\/\/\S+/gi, '[link removed]')
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/gi, '[path removed]')
    .replace(/\/(?:home|Users)\/[^/\s]+/gi, '[path removed]')
    .trim()
    .slice(0, 1200)
}
