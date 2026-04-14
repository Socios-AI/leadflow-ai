// src/components/layout/command-menu.tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import {
  Search, User, Settings, LayoutDashboard, MessageSquare, Zap,
  Plug, Loader2, ArrowRight, Mail, Smartphone, Users, BarChart3,
  HelpCircle, Brain, Plus, Megaphone, Phone, Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function CommandMenu() {
  const router = useRouter()
  const locale = useLocale()
  const base = `/${locale}`
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  const systemPages = React.useMemo(() => [
    { title: 'Dashboard', href: `${base}`, icon: LayoutDashboard, keywords: ['home', 'painel', 'visão geral'] },
    { title: 'Conversas', href: `${base}/conversations`, icon: MessageSquare, keywords: ['chat', 'whatsapp', 'mensagens', 'inbox'] },
    { title: 'Leads', href: `${base}/leads`, icon: Users, keywords: ['contatos', 'prospects', 'clientes'] },
    { title: 'Campanhas', href: `${base}/campaigns`, icon: Megaphone, keywords: ['marketing', 'ads', 'anúncios'] },
    { title: 'Nova Campanha', href: `${base}/campaigns/new`, icon: Plus, keywords: ['criar', 'nova'] },
    { title: 'Analytics', href: `${base}/analytics`, icon: BarChart3, keywords: ['relatórios', 'métricas', 'dados'] },
    { title: 'WhatsApp', href: `${base}/channels/whatsapp`, icon: Phone, keywords: ['canal', 'wpp', 'evolution'] },
    { title: 'Email', href: `${base}/channels/email`, icon: Mail, keywords: ['canal', 'resend', 'smtp'] },
    { title: 'SMS', href: `${base}/channels/sms`, icon: Smartphone, keywords: ['canal', 'twilio', 'torpedo'] },
    { title: 'Configurar IA', href: `${base}/ai-config`, icon: Brain, keywords: ['prompt', 'persona', 'bot', 'inteligência'] },
    { title: 'Integrações', href: `${base}/integrations`, icon: Plug, keywords: ['webhook', 'api', 'meta', 'google'] },
    { title: 'Configurações', href: `${base}/settings`, icon: Settings, keywords: ['conta', 'perfil', 'preferências'] },
  ], [base])

  // Close on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Ctrl+K shortcut
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); inputRef.current?.focus(); setOpen(true) }
      if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur() }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const filtered = React.useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase().trim()
    return systemPages
      .map(p => {
        let score = 0
        if (p.title.toLowerCase().includes(q)) score += 10
        if (p.title.toLowerCase().startsWith(q)) score += 5
        if (p.keywords.some(k => k.includes(q))) score += 3
        return { ...p, score }
      })
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [query, systemPages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev + 1) % filtered.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length) }
    else if (e.key === 'Enter') { e.preventDefault(); handleSelect(selectedIndex) }
  }

  const handleSelect = (idx: number) => {
    const item = filtered[idx]
    if (item) { router.push(item.href); setOpen(false); setQuery(''); inputRef.current?.blur() }
  }

  const showResults = open && query.length > 0

  return (
    <div className="relative w-full max-w-md">
      <div className="relative group">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setSelectedIndex(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar ou digitar comando..."
          className={cn(
            "h-10 w-full rounded-xl border bg-background/50 pl-10 pr-12 text-sm text-foreground placeholder:text-muted-foreground transition-all",
            "border-border/60 group-hover:border-border group-hover:bg-muted/30",
            "focus:border-primary/30 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/10"
          )}
        />
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none group-hover:text-foreground transition-colors" />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted/20 px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>

      {showResults && (
        <div ref={dropdownRef} className="absolute top-full left-0 right-0 mt-2 max-h-[450px] overflow-y-auto rounded-xl border border-border bg-popover shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {filtered.length === 0 ? (
            <div className="py-10 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum resultado encontrado</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filtered.map((result, idx) => {
                const Icon = result.icon
                const selected = selectedIndex === idx
                return (
                  <button
                    key={result.href}
                    onClick={() => handleSelect(idx)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 group/item cursor-pointer",
                      selected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                      selected ? "border-primary/20 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground group-hover/item:border-primary/20 group-hover/item:text-primary"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{result.title}</div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">Ir para</div>
                    </div>
                    <ArrowRight className={cn("h-3.5 w-3.5 shrink-0 transition-all duration-200", selected ? "opacity-100 translate-x-0 text-primary" : "opacity-0 -translate-x-2")} />
                  </button>
                )
              })}
            </div>
          )}
          <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground">
            <div className="flex gap-3">
              <span>Navegar <kbd className="font-mono bg-background border px-1 rounded mx-0.5">↓</kbd> <kbd className="font-mono bg-background border px-1 rounded mx-0.5">↑</kbd></span>
              <span>Selecionar <kbd className="font-mono bg-background border px-1 rounded mx-0.5">↵</kbd></span>
            </div>
            <span>Esc fechar</span>
          </div>
        </div>
      )}
    </div>
  )
}