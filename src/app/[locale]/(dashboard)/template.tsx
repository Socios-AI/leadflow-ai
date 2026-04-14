// src/app/[locale]/(dashboard)/template.tsx
'use client'

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-in-up">
      {children}
    </div>
  )
}