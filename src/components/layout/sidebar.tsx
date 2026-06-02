// src/components/layout/sidebar.tsx
'use client'

import { useState, useEffect } from 'react'
import { Link, usePathname, useRouter } from '@/i18n/routing'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import {
  LayoutDashboard, Brain, Settings,
  ChevronLeft, ChevronRight, ChevronDown, LogOut,
  Sun, Moon, Laptop, Users,
  Target, Phone, Mail, Smartphone,
  Globe, Filter, Headphones, Shield, HelpCircle,
} from 'lucide-react'
import { useTheme } from 'next-themes'

interface SidebarProps { isCollapsed: boolean; onToggle: () => void }
type IconType = React.ComponentType<{ className?: string }>
interface NavItem { href: string; icon: IconType; label: string; id?: string }
interface NavGroup { label: string; icon: IconType; items: NavItem[]; defaultOpen?: boolean }

const LOCALES = [
  { code: 'pt' as const, label: 'PT', name: 'Português' },
  { code: 'en' as const, label: 'EN', name: 'English' },
  { code: 'es' as const, label: 'ES', name: 'Español' },
  { code: 'it' as const, label: 'IT', name: 'Italiano' },
]

interface SessionInfo {
  email?: string
  userName?: string
  accountName?: string
  platformRole?: 'USER' | 'SUPER_ADMIN' | 'HIPER_ADMIN'
}

function initials(name?: string): string {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const t = useTranslations('sidebar')
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [session, setSession] = useState<SessionInfo>({})
  const isAdminish = session.platformRole === 'SUPER_ADMIN' || session.platformRole === 'HIPER_ADMIN'

  useEffect(() => { setMounted(true) }, [])

  // Read the current session once, it carries the user + account display info.
  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: SessionInfo | null) => { if (s) setSession(s) })
      .catch(() => {})
  }, [])

  function cycleTheme() {
    const current = theme || 'dark'
    if (current === 'light') setTheme('purple')
    else if (current === 'purple') setTheme('dark')
    else setTheme('light')
  }

  function switchLocale(newLocale: 'pt' | 'en' | 'es' | 'it') {
    // Persist the choice so server-rendered routes pick up the right
    // locale on the very first request after a hard refresh or when the
    // user lands via a deep link without a prefix. next-intl reads this
    // cookie when localeDetection is enabled (see src/i18n/routing.ts).
    // 1 year expiry, root path so it covers every page.
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.replace(pathname, { locale: newLocale })
    setShowLangMenu(false)
  }

  // Real sign-out: hit the API first so Supabase cookies are cleared,
  // THEN navigate. Just redirecting kept the session alive and middleware
  // bounced the user right back to the dashboard.
  async function handleSignOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // best-effort, we navigate either way
    }
    window.location.href = `/${locale}/login`
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const currentLocale = LOCALES.find((l) => l.code === locale) || LOCALES[0]

  const topNav: NavItem[] = [
    { href: '/', icon: LayoutDashboard, label: t('dashboard'), id: 'sidebar-painel' },
    { href: '/conversations', icon: Headphones, label: t('conversations'), id: 'sidebar-atendimentos' },
    { href: '/campaigns', icon: Target, label: t('campaigns'), id: 'sidebar-campanhas' },
  ]

  const operationNav: NavItem[] = [
    { href: '/leads', icon: Users, label: 'Leads', id: 'sidebar-leads' },
    { href: '/pipeline', icon: Filter, label: t('pipeline'), id: 'sidebar-funil' },
  ]

  const navGroups: NavGroup[] = [
    {
      label: t('connections'), icon: Globe, defaultOpen: false,
      items: [
        { href: '/channels/whatsapp', icon: Phone, label: 'WhatsApp' },
        { href: '/channels/email', icon: Mail, label: 'E-mail' },
        { href: '/channels/sms', icon: Smartphone, label: 'SMS' },
      ],
    },
  ]

  const configNav: NavItem[] = [
    { href: '/ai-config', icon: Brain, label: t('aiAssistant'), id: 'sidebar-assistente' },
    { href: '/settings', icon: Settings, label: t('account'), id: 'sidebar-conta' },
    { href: '/help', icon: HelpCircle, label: t('help'), id: 'sidebar-help' },
  ]

  function isItemActive(href: string) {
    if (href === '/') return pathname === '/' || pathname === ''
    return pathname === href || pathname?.startsWith(href + '/')
  }

  useEffect(() => {
    const newExp: Record<string, boolean> = {}
    navGroups.forEach((g) => {
      if (g.items.some((i) => isItemActive(i.href))) newExp[g.label] = true
    })
    setExpandedGroups((prev) => ({ ...prev, ...newExp }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const displayName = session.userName || (session.email ? session.email.split('@')[0] : '')
  const workspace = session.accountName

  return (
    <div className="relative h-full flex flex-col bg-card border-r border-border transition-all duration-300 font-dm-sans">
      {/* ═══ LOGO / BRAND ═══ */}
      <div
        className={cn(
          'flex items-center border-b border-border shrink-0',
          isCollapsed ? 'h-16 justify-center px-2' : 'h-[68px] justify-between px-4'
        )}
      >
        {!isCollapsed ? (
          <Link href="/" className="group flex items-center gap-3 min-w-0">
            <div className="relative w-9 h-9 rounded-xl overflow-hidden shrink-0 ring-1 ring-border/70 shadow-md transition-transform group-hover:scale-[1.04]">
              <Image
                src="/logo.png"
                alt="MKT Digital"
                width={36}
                height={36}
                className="object-contain"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card shadow-sm" />
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[14px] font-semibold text-foreground tracking-tight truncate font-display">
                MKT Digital
              </span>
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/65 truncate">
                {t('tagline')}
              </span>
            </div>
          </Link>
        ) : (
          <Link href="/" className="block relative">
            <div className="w-9 h-9 rounded-xl overflow-hidden ring-1 ring-border/70 shadow-md hover:scale-[1.04] transition-transform">
              <Image src="/logo.png" alt="MKT Digital" width={36} height={36} className="object-contain" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card shadow-sm" />
          </Link>
        )}
      </div>

      {/* Collapse button sits half-outside the rail for a Linear-style affordance */}
      <button
        onClick={onToggle}
        aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        className="absolute -right-3 top-[60px] z-50 w-6 h-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted hover:border-primary/40 transition-all cursor-pointer"
      >
        {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* ═══ NAV ═══ */}
      <nav className="flex-1 py-4 px-2.5 overflow-y-auto scrollbar-hide">
        <div className="space-y-0.5">
          {topNav.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              isCollapsed={isCollapsed}
              isActive={isItemActive(item.href)}
            />
          ))}
        </div>

        <SectionHeader label={t('sectionOperation')} isCollapsed={isCollapsed} />
        <div className="space-y-0.5">
          {operationNav.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              isCollapsed={isCollapsed}
              isActive={isItemActive(item.href)}
            />
          ))}
        </div>

        <SectionHeader label={t('sectionChannels')} isCollapsed={isCollapsed} />
        {navGroups.map((group) => {
          const isOpen = expandedGroups[group.label] ?? group.defaultOpen ?? false
          const hasActive = group.items.some((i) => isItemActive(i.href))
          const GIcon = group.icon
          return (
            <div key={group.label} className="mb-0.5">
              {!isCollapsed ? (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium font-dm-sans cursor-pointer transition-colors',
                    hasActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  <GIcon className="w-4 h-4 shrink-0 opacity-70" />
                  <span className="flex-1 text-left truncate">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      'w-3 h-3 opacity-50 transition-transform duration-200',
                      isOpen && 'rotate-180'
                    )}
                  />
                </button>
              ) : (
                <div className="my-2 mx-2 h-px bg-border/40" />
              )}
              <div
                className={cn(
                  'overflow-hidden transition-all duration-200',
                  isOpen || isCollapsed ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                )}
              >
                <div className={cn('space-y-0.5', !isCollapsed && 'ml-[18px] pl-3 border-l border-border/40 mt-1')}>
                  {group.items.map((item) => (
                    <SidebarNavLink
                      key={item.href}
                      item={item}
                      isCollapsed={isCollapsed}
                      isActive={isItemActive(item.href)}
                      indent
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        })}

        <SectionHeader label={t('sectionSettings')} isCollapsed={isCollapsed} />
        <div className="space-y-0.5">
          {configNav.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              isCollapsed={isCollapsed}
              isActive={isItemActive(item.href)}
            />
          ))}
        </div>

        {/* ═══ ADMIN (super admin / hiper admin) ═══ */}
        {isAdminish && (
          <>
            <SectionHeader label={t('sectionAdmin')} isCollapsed={isCollapsed} tone="danger" />
            <div className="space-y-0.5">
              <SidebarNavLink
                item={{ href: '/admin', icon: Shield, label: t('adminPanel'), id: 'sidebar-admin' }}
                isCollapsed={isCollapsed}
                isActive={isItemActive('/admin')}
                admin
              />
            </div>
          </>
        )}
      </nav>

      {/* ═══ FOOTER: user card + utility icons ═══ */}
      <div className="border-t border-border shrink-0">
        {!isCollapsed ? (
          <div className="p-2.5 space-y-2">
            {/* User card */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-muted/40 transition-colors cursor-pointer text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/25 to-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                  {initials(displayName)}
                </div>
                <div className="flex-1 min-w-0 leading-tight">
                  <p className="text-[12.5px] font-semibold text-foreground truncate">
                    {displayName || '—'}
                  </p>
                  {workspace && (
                    <p className="text-[10.5px] text-muted-foreground/70 truncate">{workspace}</p>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    'w-3 h-3 text-muted-foreground/50 transition-transform shrink-0',
                    showUserMenu && 'rotate-180'
                  )}
                />
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute bottom-full mb-1 left-0 right-0 z-50 bg-card border border-border rounded-xl shadow-floating overflow-hidden py-1 animate-fade-in-up">
                    {session.email && (
                      <div className="px-3 py-2 border-b border-border/60">
                        <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60">
                          Email
                        </p>
                        <p className="text-[12px] text-foreground truncate mt-0.5">{session.email}</p>
                      </div>
                    )}
                    <Link
                      href="/settings"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                      {t('account')}
                    </Link>
                    <button
                      onClick={() => {
                        handleSignOut()
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      {t('signOut')}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Utility row: theme + language */}
            <div className="flex items-center gap-1 px-1">
              {mounted && (
                <button
                  onClick={cycleTheme}
                  title={theme || 'dark'}
                  className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer"
                >
                  {theme === 'light' && <Sun className="w-3.5 h-3.5" />}
                  {theme === 'purple' && <Laptop className="w-3.5 h-3.5" />}
                  {(theme === 'dark' || !theme) && <Moon className="w-3.5 h-3.5" />}
                </button>
              )}
              <div className="relative flex-1">
                <button
                  onClick={() => setShowLangMenu(!showLangMenu)}
                  className="w-full h-8 px-2 rounded-md flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="text-[10.5px] font-semibold">{currentLocale.label}</span>
                  <span className="text-[10.5px] text-muted-foreground/60 truncate flex-1 text-left">
                    {currentLocale.name}
                  </span>
                </button>
                {showLangMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
                    <div className="absolute bottom-full mb-2 left-0 right-0 z-50 bg-card border border-border rounded-xl shadow-floating py-1 animate-fade-in-up">
                      {LOCALES.map((loc) => (
                        <button
                          key={loc.code}
                          onClick={() => switchLocale(loc.code)}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium transition-colors cursor-pointer',
                            locale === loc.code
                              ? 'text-foreground bg-muted'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                          )}
                        >
                          <span className="text-[10px] font-mono text-muted-foreground/70 w-6">
                            {loc.label}
                          </span>
                          <span className="flex-1 text-left">{loc.name}</span>
                          {locale === loc.code && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          // Collapsed footer: compact icon stack
          <div className="flex flex-col items-center gap-1 py-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/25 to-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
              {initials(displayName)}
            </div>
            <div className="h-px w-6 bg-border/40 my-1" />
            {mounted && (
              <button
                onClick={cycleTheme}
                title={theme || 'dark'}
                className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer"
              >
                {theme === 'light' && <Sun className="w-3.5 h-3.5" />}
                {theme === 'purple' && <Laptop className="w-3.5 h-3.5" />}
                {(theme === 'dark' || !theme) && <Moon className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer relative"
            >
              <Globe className="w-3.5 h-3.5" />
              {showLangMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
                  <div className="absolute left-full ml-2 bottom-0 z-50 bg-card border border-border rounded-xl shadow-floating py-1 min-w-[140px] animate-fade-in-up">
                    {LOCALES.map((loc) => (
                      <button
                        key={loc.code}
                        onClick={() => switchLocale(loc.code)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium transition-colors cursor-pointer',
                          locale === loc.code
                            ? 'text-foreground bg-muted'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        )}
                      >
                        <span className="text-[10px] font-mono text-muted-foreground/70 w-6">
                          {loc.label}
                        </span>
                        <span>{loc.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </button>
            <button
              onClick={() => {
                handleSignOut()
              }}
              title={t('signOut')}
              className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHeader({
  label,
  isCollapsed,
  tone = 'default',
}: {
  label: string
  isCollapsed: boolean
  tone?: 'default' | 'danger'
}) {
  if (isCollapsed) {
    return (
      <div
        className={cn(
          'my-3 mx-2 h-px',
          tone === 'danger' ? 'bg-red-500/20' : 'bg-border/40'
        )}
      />
    )
  }
  return (
    <div className="mt-5 mb-1.5 px-3">
      <span
        className={cn(
          'text-[10px] font-bold uppercase tracking-[0.14em]',
          tone === 'danger' ? 'text-red-400/70' : 'text-muted-foreground/65'
        )}
      >
        {label}
      </span>
    </div>
  )
}

function SidebarNavLink({
  item,
  isCollapsed,
  isActive,
  indent,
  admin,
}: {
  item: NavItem
  isCollapsed: boolean
  isActive: boolean
  indent?: boolean
  admin?: boolean
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      id={item.id}
      prefetch
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium font-dm-sans',
        'transition-[background-color,color,transform] duration-150 ease-out',
        isCollapsed ? 'justify-center px-2 py-2' : 'px-3 py-2',
        indent && !isCollapsed && 'py-1.5 text-[12.5px]',
        isActive
          ? admin
            ? 'bg-red-500/10 text-red-400 font-semibold'
            : 'bg-primary/[0.1] text-foreground font-semibold'
          : admin
            ? 'text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.07]'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/45'
      )}
      title={isCollapsed ? item.label : undefined}
    >
      {/* Active indicator rail, only on expanded view */}
      {isActive && !isCollapsed && (
        <span
          className={cn(
            'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full',
            admin ? 'bg-red-400' : 'bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.55)]'
          )}
        />
      )}

      <Icon
        className={cn(
          'shrink-0 transition-colors',
          indent && !isCollapsed ? 'w-[15px] h-[15px]' : 'w-[17px] h-[17px]',
          isActive
            ? admin
              ? 'text-red-400'
              : 'text-primary'
            : 'opacity-70 group-hover:opacity-100'
        )}
      />
      {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
      {isActive && !isCollapsed && !admin && (
        <span className="w-1 h-1 rounded-full bg-primary shadow-[0_0_4px_hsl(var(--primary)/0.6)] shrink-0" />
      )}
    </Link>
  )
}
