import { app, shell } from 'electron'
import { resolveFfmpeg, resolveYtdlp } from './engine/binaries'
import { isPortable } from './paths'
import type { FeedbackDraft, FeedbackKind } from '../shared/types'
import { sanitise } from './sanitise.ts'

const REPO = 'https://github.com/BKHornYT/tizo'

const TEMPLATE: Record<FeedbackKind, string> = {
  site: 'site-request.yml',
  idea: 'suggestion.yml',
  bug: 'bug.yml'
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Builds what we would send, without sending it. The renderer shows this to the
 * user first — asking someone to file a report should not mean asking them to
 * trust that nothing personal is attached.
 */
export async function buildFeedback(
  kind: FeedbackKind,
  context?: { url?: string; errorCode?: string; errorDetail?: string }
): Promise<FeedbackDraft> {
  const [ytdlp, ffmpeg] = await Promise.all([resolveYtdlp(), resolveFfmpeg()])

  const env = [
    `Tizo: ${app.getVersion()}${isPortable() ? ' (portable)' : ''}`,
    `Engine: ${ytdlp.version ?? 'not installed'}`,
    `HQ pack: ${ffmpeg.version ?? 'not installed'}`,
    `OS: ${process.platform} ${process.getSystemVersion?.() ?? ''}`.trim()
  ].join('\n')

  const domain = context?.url ? hostOf(context.url) : ''

  const lines: string[] = []
  if (kind === 'site') {
    if (context?.errorCode) lines.push(`Failure: ${context.errorCode}`)
    if (context?.errorDetail) lines.push('', sanitise(context.errorDetail))
  }
  lines.push('', env)

  return {
    kind,
    domain,
    // Shown verbatim in the confirmation dialog.
    body: lines.join('\n').trim(),
    url: buildUrl(kind, domain, lines.join('\n').trim())
  }
}

function buildUrl(kind: FeedbackKind, domain: string, body: string): string {
  const params = new URLSearchParams({ template: TEMPLATE[kind] })
  if (kind === 'site') {
    if (domain) {
      params.set('title', `[site] ${domain}`)
      params.set('domain', domain)
    }
    params.set('details', body)
  } else if (kind === 'bug') {
    params.set('env', body)
  }
  return `${REPO}/issues/new?${params.toString()}`
}

export async function openFeedback(url: string): Promise<void> {
  // Only ever our own issue tracker — never an arbitrary URL from the renderer.
  if (!url.startsWith(`${REPO}/issues/new`)) return
  await shell.openExternal(url)
}

export function issuesUrl(): string {
  return `${REPO}/issues`
}
