// src/components/layout/dashboard-shell.tsx
'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, Zap } from 'lucide-react'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { cn } from '@/lib/utils'

const FULL_BLEED_ROUTES = [
  '/conversations',
  '/campaigns/new',
]

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  const isFullBleed = FULL_BLEED_ROUTES.some(r => pathname?.includes(r))

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden cursor-pointer"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 bg-card border-r border-border",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[260px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <Sidebar
          isCollapsed={collapsed}
          onToggle={() => {
            setCollapsed(!collapsed)
            setMobileOpen(false)
          }}
        />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop header */}
        <div className="hidden lg:block shrink-0">
          <Header />
        </div>

        {/* Mobile header */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 h-14 border-b border-border bg-background/80 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#B9F495] to-[#8ee060] flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
              </div>
              <span className="text-sm font-bold text-foreground tracking-tight">LeadFlow AI</span>
            </div>
          </div>
          <Header />
        </div>

        {/* Content */}
        <main className={cn("flex-1 relative", !isFullBleed && "overflow-y-auto")}>
          {isFullBleed ? (
            <div className="relative flex-1 h-full overflow-hidden">{children}</div>
          ) : (
            <div className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1920px] mx-auto w-full">{children}</div>
          )}
        </main>
      </div>
    </div>
  )
}