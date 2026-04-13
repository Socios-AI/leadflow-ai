"use client";

import React, { createContext, useContext } from "react";

interface SessionContextType {
  user: {
    id: string;
    email: string;
    name: string;
  };
  account: {
    id: string;
    name?: string;
  };
  role: string;
}

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: SessionContextType;
}) {
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}