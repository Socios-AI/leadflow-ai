// src/components/layout/header.tsx
"use client";

import React from "react";
import { Search, Bell } from "lucide-react";

export function Header() {
  return (
    <header className="flex items-center justify-end px-6 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        {/* Search */}
        <button className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-muted/50 border border-border hover:border-[var(--glass-border-hover)] hover:bg-muted transition-all duration-200 w-[200px] cursor-pointer group">
          <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          <span className="text-xs text-muted-foreground group-hover:text-foreground/70 transition-colors">Buscar...</span>
          <span className="ml-auto text-[10px] text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded">
            ⌘K
          </span>
        </button>

        {/* Notifications */}
        <button className="relative w-9 h-9 rounded-xl bg-muted/50 border border-border hover:border-[var(--glass-border-hover)] hover:bg-muted flex items-center justify-center transition-all duration-200 cursor-pointer group">
          <Bell className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          <span className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-[var(--chip-brand-text)] shadow-[0_0_8px_rgba(185,244,149,0.4)]" />
        </button>
      </div>
    </header>
  );
}