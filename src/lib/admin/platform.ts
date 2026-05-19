// src/lib/admin/platform.ts
//
// Platform-role guards and helpers used by the /admin tenants flow.
//
// Roles:
//   USER         default, no admin powers.
//   SUPER_ADMIN  can create tenants for clients. Sees ONLY tenants they
//                themselves created.
//   HIPER_ADMIN  system creator. Sees everything, can promote/demote
//                super admins, can see all tenants from all super admins.

import { getSession, type Session, type PlatformRole } from "@/lib/auth/session";

export const ADMIN_ROLES: PlatformRole[] = ["SUPER_ADMIN", "HIPER_ADMIN"];

export function isHiperAdmin(s: Session | null): boolean {
  return !!s && s.platformRole === "HIPER_ADMIN";
}

export function isSuperAdminOrHigher(s: Session | null): boolean {
  return !!s && (s.platformRole === "SUPER_ADMIN" || s.platformRole === "HIPER_ADMIN");
}

export class AdminAuthError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
    this.name = "AdminAuthError";
  }
}

export async function requireSuperAdminOrHigher(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AdminAuthError(401, "unauthorized");
  if (!isSuperAdminOrHigher(s)) throw new AdminAuthError(403, "forbidden");
  return s;
}

export async function requireHiperAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AdminAuthError(401, "unauthorized");
  if (!isHiperAdmin(s)) throw new AdminAuthError(403, "forbidden");
  return s;
}

// Password generator + invite message templates

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generatePassword(length = 14): string {
  const buf = new Uint32Array(length);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 1e9);
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[buf[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

type InviteLocale = "pt" | "en" | "es" | "it";

export interface InviteMessageInput {
  appUrl: string;
  companyName: string;
  ownerName: string;
  email: string;
  password: string;
  locale?: InviteLocale;
}

const TEMPLATES: Record<InviteLocale, (i: InviteMessageInput) => string> = {
  pt: (i) => `Ola ${i.ownerName},

Sua conta na plataforma foi criada para a ${i.companyName}.

Acesse: ${i.appUrl}/login
E-mail: ${i.email}
Senha temporaria: ${i.password}

Recomendamos trocar a senha logo no primeiro acesso. Qualquer duvida responda esta mensagem.`,
  en: (i) => `Hi ${i.ownerName},

Your platform account for ${i.companyName} is ready.

Sign in: ${i.appUrl}/login
Email: ${i.email}
Temporary password: ${i.password}

We recommend changing your password on first login. Reply to this message if anything is off.`,
  es: (i) => `Hola ${i.ownerName},

Tu cuenta de la plataforma para ${i.companyName} esta lista.

Acceso: ${i.appUrl}/login
Correo: ${i.email}
Contrasena temporal: ${i.password}

Te recomendamos cambiar la contrasena en el primer acceso. Si algo no esta bien responde este mensaje.`,
  it: (i) => `Ciao ${i.ownerName},

Il tuo account per ${i.companyName} e pronto.

Accedi: ${i.appUrl}/login
Email: ${i.email}
Password temporanea: ${i.password}

Ti consigliamo di cambiare la password al primo accesso. Per qualsiasi dubbio rispondi a questo messaggio.`,
};

export function buildInviteMessage(input: InviteMessageInput): string {
  const locale = input.locale || "pt";
  return TEMPLATES[locale](input);
}

export interface TeamInviteInput {
  appUrl: string;
  workspaceName: string;
  inviterName: string;
  memberName: string;
  email: string;
  password: string;
  role: string;
  locale?: InviteLocale;
}

const TEAM_TEMPLATES: Record<InviteLocale, (i: TeamInviteInput) => string> = {
  pt: (i) => `Ola ${i.memberName},

${i.inviterName} acabou de te adicionar como ${roleLabel(i.role, "pt")} no workspace ${i.workspaceName}.

Acesse: ${i.appUrl}/login
E-mail: ${i.email}
Senha temporaria: ${i.password}

Recomendamos trocar a senha logo no primeiro acesso.`,
  en: (i) => `Hi ${i.memberName},

${i.inviterName} just added you as ${roleLabel(i.role, "en")} to the ${i.workspaceName} workspace.

Sign in: ${i.appUrl}/login
Email: ${i.email}
Temporary password: ${i.password}

We recommend changing your password on first login.`,
  es: (i) => `Hola ${i.memberName},

${i.inviterName} te acaba de agregar como ${roleLabel(i.role, "es")} al workspace ${i.workspaceName}.

Acceso: ${i.appUrl}/login
Correo: ${i.email}
Contrasena temporal: ${i.password}

Te recomendamos cambiar la contrasena en el primer acceso.`,
  it: (i) => `Ciao ${i.memberName},

${i.inviterName} ti ha appena aggiunto come ${roleLabel(i.role, "it")} nel workspace ${i.workspaceName}.

Accedi: ${i.appUrl}/login
Email: ${i.email}
Password temporanea: ${i.password}

Ti consigliamo di cambiare la password al primo accesso.`,
};

function roleLabel(role: string, locale: InviteLocale): string {
  const map: Record<string, Record<InviteLocale, string>> = {
    OWNER: { pt: "proprietario", en: "owner", es: "propietario", it: "proprietario" },
    ADMIN: { pt: "administrador", en: "admin", es: "administrador", it: "amministratore" },
    MEMBER: { pt: "membro", en: "member", es: "miembro", it: "membro" },
  };
  return map[role]?.[locale] || role.toLowerCase();
}

export function buildTeamInviteMessage(input: TeamInviteInput): string {
  const locale = input.locale || "pt";
  return TEAM_TEMPLATES[locale](input);
}
