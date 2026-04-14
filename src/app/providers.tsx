// src/app/providers.tsx
"use client";

import React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: "#0a0a0a",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "#fff",
            fontSize: "13px",
          },
        }}
      />
    </ThemeProvider>
  );
}