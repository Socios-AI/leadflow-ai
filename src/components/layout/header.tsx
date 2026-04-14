// src/components/layout/header.tsx
'use client'

import { CommandMenu } from '@/components/layout/command-menu'
import { NotificationsPopover } from '@/components/layout/notifications-popover'
import { HelpCircle } from 'lucide-react'

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/60 bg-background/80 px-6 backdrop-blur-md transition-all">
      <div className="flex-1" />

      <div className="flex items-center gap-3 md:gap-4">
        <CommandMenu />
        <div className="h-6 w-px bg-border/60 mx-1" />
        <div className="flex items-center gap-2">
          <NotificationsPopover />
          <button className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-muted/60 transition-colors cursor-pointer" title="Central de Ajuda">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </header>
  )
}