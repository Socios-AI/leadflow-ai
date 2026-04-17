// src/app/[locale]/onboarding/layout.tsx
//
// Minimal layout for the first-run onboarding wizard — no sidebar, no
// header. The page renders a full-screen wizard that guides the user
// through their first configuration.
import React from "react";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
