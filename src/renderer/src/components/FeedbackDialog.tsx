import { useEffect, useState } from 'react'
import type { FeedbackDraft, FeedbackKind } from '../../../shared/types'
import { strings } from '../strings'

/**
 * Shows exactly what will be attached before anything opens.
 *
 * Asking someone to file a report should not mean asking them to trust that
 * nothing personal is riding along — so the payload is rendered verbatim, and
 * the report only opens when they say so.
 */
export default function FeedbackDialog({
  kind,
  context,
  onClose
}: {
  kind: FeedbackKind
  context?: { url?: string; errorCode?: string; errorDetail?: string }
  onClose: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<FeedbackDraft | null>(null)

  useEffect(() => {
    void window.tizo.feedback.draft(kind, context).then(setDraft)
    // `context` is a fresh object each render; keying off its fields avoids a loop.
  }, [kind, context?.url, context?.errorCode, context?.errorDetail])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-chrome-900/60 px-8 py-10">
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-xl border border-surface-line bg-white shadow-2xl">
        <header className="shrink-0 px-5 pt-5">
          <h3 className="font-semibold text-ink-900">{strings.feedback.title[kind]}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">{strings.feedback.intro}</p>
          {kind === 'site' && (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900">
              {strings.feedback.staleHint}
            </p>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {draft?.domain && (
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-xs font-medium text-ink-500">
                {strings.feedback.domainLabel}
              </span>
              <code className="font-mono text-xs text-ink-900">{draft.domain}</code>
            </div>
          )}

          <p className="mb-1.5 text-xs font-medium text-ink-500">
            {strings.feedback.attachedLabel}
          </p>
          <pre className="max-h-56 overflow-auto rounded-lg bg-ink-900/6 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-700 select-text">
            {draft ? draft.body : '…'}
          </pre>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">{strings.feedback.privacy}</p>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-surface-line px-5 py-3">
          <button
            onClick={() => void window.tizo.feedback.browseIssues()}
            className="text-xs text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
          >
            {strings.feedback.browse}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md bg-ink-900/8 px-3 py-2 text-xs text-ink-700 hover:bg-ink-900/15"
            >
              {strings.feedback.cancel}
            </button>
            <button
              onClick={() => {
                if (draft) void window.tizo.feedback.open(draft.url)
                onClose()
              }}
              disabled={!draft}
              className="rounded-md bg-brand-500 px-4 py-2 text-xs font-medium text-white transition enabled:hover:bg-brand-400 disabled:opacity-40"
            >
              {strings.feedback.open}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
