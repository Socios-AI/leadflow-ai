// src/app/[locale]/(dashboard)/template.tsx
'use client'

import { usePathname } from 'next/navigation'

// Full-bleed routes fill 100% of the dashboard shell height and manage their
// OWN internal scroll (e.g. the conversations CRM split-pane). They must NOT
// be wrapped in a plain block div: that breaks the flex height chain between
// the shell column and the page, so the page grows to its content height,
// overflows below the shell's `overflow-hidden`, and produces the "black bar
// below the chat + chat won't scroll" bug. For those routes the wrapper has to
// be a transparent flex item (flex-1 + min-h-0) that passes the height down.
//
// Keep this list in sync with FULL_BLEED_ROUTES in dashboard-shell.tsx.
const FULL_BLEED_ROUTES = ['/conversations']

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullBleed = FULL_BLEED_ROUTES.some((r) => pathname?.includes(r))

  // Full-bleed: transparent flex pass-through (no entry animation — the page
  // owns its own loading skeletons). Everything else: the original fade-in.
  return (
    <div className={isFullBleed ? 'flex flex-1 flex-col min-h-0' : 'animate-fade-in-up'}>
      {children}
    </div>
  )
}
