// src/components/layout/sidebar.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Megaphone,
  BarChart3,
  Settings,
  Bot,
  Globe,
  Zap,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS = [
  { key: "Dashboard", href: "", icon: LayoutDashboard, badge: null },
  { key: "Conversas", href: "/conversations", icon: MessageSquare, badge: "12" },
  { key: "Leads", href: "/leads", icon: Users, badge: null },
  { key: "Campanhas", href: "/campaigns", icon: Megaphone, badge: null },
  { key: "Analytics", href: "/analytics", icon: BarChart3, badge: null },
];

const CONFIG_ITEMS = [
  { key: "IA Config", href: "/ai-config", icon: Bot },
  { key: "Canais", href: "/channels", icon: Globe },
  { key: "Configurações", href: "/settings", icon: Settings },
];

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const base = `/${locale}`;

  function isActive(href: string) {
    const full = base + href;
    if (href === "") return pathname === base || pathname === base + "/";
    return pathname?.startsWith(full) ?? false;
  }

  return (
    <div className="flex flex-col h-full relative select-none">
      {/* ── Logo ── */}
      <div
        className={cn(
          "flex items-center gap-2.5 shrink-0 border-b border-border",
          isCollapsed ? "px-3 py-4 justify-center" : "px-5 py-4"
        )}
      >
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#B9F495] to-[#9ee86f] flex items-center justify-center shrink-0 shadow-[0_4px_14px_rgba(185,244,149,0.3)]">
          <Zap className="w-[18px] h-[18px] text-black" strokeWidth={2.5} />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-foreground tracking-tight leading-none">
              LeadAI
            </p>
            <p className="text-[9px] font-semibold text-muted-foreground tracking-[1.5px] uppercase mt-0.5">
              SALES AUTOMATION
            </p>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {!isCollapsed && (
          <p className="text-[10px] font-semibold text-muted-foreground/50 tracking-[1.5px] uppercase px-3 mb-2">
            Principal
          </p>
        )}
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={`${base}${item.href}`}
              className={cn(
                "flex items-center gap-3 rounded-xl text-[13px] font-medium relative group cursor-pointer",
                "transition-all duration-200 ease-out",
                isCollapsed ? "px-0 py-2.5 justify-center" : "px-3 py-2.5",
                active
                  ? "bg-[var(--chip-brand-bg)] text-[var(--chip-brand-text)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-full bg-[var(--chip-brand-text)]" />
              )}
              <Icon className={cn("w-[18px] h-[18px] shrink-0 transition-transform duration-200", !active && "group-hover:scale-110")} />
              {!isCollapsed && (
                <>
                  <span className="flex-1">{item.key}</span>
                  {item.badge && (
                    <span className="btn-brand text-[10px] font-bold px-1.5 rounded-md min-w-[20px] text-center leading-[18px]">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}

        <div className="h-px bg-border my-3 mx-2" />

        {!isCollapsed && (
          <p className="text-[10px] font-semibold text-muted-foreground/50 tracking-[1.5px] uppercase px-3 mb-2">
            Configuração
          </p>
        )}
        {CONFIG_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={`${base}${item.href}`}
              className={cn(
                "flex items-center gap-3 rounded-xl text-[13px] font-medium relative group cursor-pointer",
                "transition-all duration-200 ease-out",
                isCollapsed ? "px-0 py-2.5 justify-center" : "px-3 py-2.5",
                active
                  ? "bg-[var(--chip-brand-bg)] text-[var(--chip-brand-text)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-full bg-[var(--chip-brand-text)]" />
              )}
              <Icon className={cn("w-[18px] h-[18px] shrink-0 transition-transform duration-200", !active && "group-hover:scale-110")} />
              {!isCollapsed && <span>{item.key}</span>}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom ── */}
      <div className="shrink-0 border-t border-border p-3 space-y-3">
        {/* Theme switcher */}
        {!isCollapsed ? (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50">
            {[
              { v: "light" as const, icon: Sun, l: "Claro" },
              { v: "dark" as const, icon: Moon, l: "Escuro" },
              { v: "system" as const, icon: Monitor, l: "Sistema" },
            ].map((opt) => {
              const active = theme === opt.v;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.v}
                  onClick={() => setTheme(opt.v)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer",
                    "transition-all duration-200",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.l}
                </button>
              );
            })}
          </div>
        ) : (
          <button
            onClick={() =>
              setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")
            }
            className="w-full flex justify-center py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            {theme === "dark" ? (
              <Moon className="w-4 h-4" />
            ) : theme === "light" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4" />
            )}
          </button>
        )}

        {/* User card */}
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-xl p-2.5 cursor-pointer",
            "bg-muted/30 border border-border hover:border-[var(--glass-border-hover)]",
            "transition-all duration-200 hover:bg-muted/50",
            isCollapsed && "justify-center"
          )}
        >
          <div className="w-8 h-8 rounded-lg btn-brand flex items-center justify-center text-[11px] font-bold shrink-0">
            JD
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-foreground leading-tight truncate">
                John Doe
              </p>
              <p className="text-[10px] text-muted-foreground">Pro Plan</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Collapse toggle ── */}
      <button
        onClick={onToggle}
        className={cn(
          "absolute top-5 -right-3 w-6 h-6 rounded-lg bg-card border border-border",
          "flex items-center justify-center text-muted-foreground cursor-pointer",
          "hover:text-foreground hover:border-[var(--glass-border-hover)] hover:bg-muted",
          "transition-all duration-200 z-10 shadow-sm"
        )}
      >
        {isCollapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}