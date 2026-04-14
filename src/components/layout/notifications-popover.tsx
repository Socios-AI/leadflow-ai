// src/components/layout/notifications-popover.tsx
'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

export function NotificationsPopover() {
  const [notifications] = useState<Notification[]>([])
  const [unreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative h-9 w-9 rounded-lg flex items-center justify-center hover:bg-muted/60 transition-colors cursor-pointer"
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-rose-500 border border-background animate-pulse" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border/60 shadow-xl bg-card z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <h4 className="text-sm font-semibold">Notificações</h4>
              {unreadCount > 0 && (
                <button className="text-[10px] text-primary hover:underline cursor-pointer">
                  Marcar lidas
                </button>
              )}
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs">
                  Nenhuma notificação nova
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {notifications.map(n => (
                    <div key={n.id} className={cn("px-4 py-3 hover:bg-muted/30 transition-colors", !n.read && "bg-primary/[0.03]")}>
                      <div className="flex justify-between items-start gap-2">
                        <p className={cn("text-xs font-medium", !n.read ? "text-foreground" : "text-muted-foreground")}>
                          {n.title}
                        </p>
                        <span className="text-[9px] text-muted-foreground shrink-0">{n.createdAt}</span>
                      </div>
                      {n.message && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}