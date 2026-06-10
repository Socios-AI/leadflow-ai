// src/components/leads/import-modal.tsx
//
// Spreadsheet lead import with column mapping. Three steps:
//   1) upload  — pick a CSV/XLSX; we POST action=preview to detect columns
//   2) map     — confirm/edit which column is name/email/phone/etc
//   3) done    — show how many were created/skipped
//
// Strings are pt-BR for now (the product's primary locale); can be moved to
// next-intl keys later. Talks to /api/leads/import.
"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, Loader2, X, ArrowRight, CheckCircle2, FileSpreadsheet, AlertTriangle } from "lucide-react";

type LeadField = "name" | "email" | "phone" | "countryCode" | "campaign";
type Mapping = Partial<Record<LeadField, string>>;

interface PreviewResp {
  headers: string[];
  totalRows: number;
  sampleRows: Record<string, string>[];
  suggestedMapping: Mapping;
  fields: LeadField[];
}
interface CommitResp {
  success: boolean;
  created: number;
  skippedDuplicate: number;
  skippedNoContact: number;
  truncated: boolean;
  contacted: number;
}

const FIELD_LABEL: Record<LeadField, string> = {
  name: "Nome",
  email: "Email",
  phone: "Telefone / WhatsApp",
  countryCode: "Código do país (DDI)",
  campaign: "Campanha",
};
const FIELD_HINT: Record<LeadField, string> = {
  name: "Como a IA vai chamar o lead",
  email: "Para atendimento por email",
  phone: "Obrigatório para a IA chamar no WhatsApp",
  countryCode: "Ex: 55 (Brasil). Opcional",
  campaign: "Liga o lead a uma campanha existente. Opcional",
};
const IGNORE = "__ignore__";

export function LeadImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [contactNow, setContactNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResp | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setMapping({});
    setContactNow(true);
    setBusy(false);
    setError(null);
    setResult(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  async function handleFile(f: File) {
    setError(null);
    setFile(f);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("action", "preview");
      const r = await fetch("/api/leads/import", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(errorMessage(d.error));
        setFile(null);
        return;
      }
      const p = d as PreviewResp;
      setPreview(p);
      setMapping(p.suggestedMapping || {});
      setStep("map");
    } catch {
      setError("Não consegui ler o arquivo. Tente novamente.");
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setError(null);
    if (!mapping.phone && !mapping.email) {
      setError("Mapeie ao menos a coluna de Telefone ou de Email — a IA precisa de um canal para falar com o lead.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("action", "commit");
      fd.append("mapping", JSON.stringify(mapping));
      fd.append("contactNow", String(contactNow));
      const r = await fetch("/api/leads/import", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(errorMessage(d.error));
        return;
      }
      setResult(d as CommitResp);
      setStep("done");
      onImported();
    } catch {
      setError("Falha ao importar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in" onClick={close} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[94vw] max-w-[640px] max-h-[88vh] overflow-y-auto rounded-2xl border border-border/80 bg-card shadow-floating animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-display text-[15px] font-semibold text-foreground">Importar leads de planilha</h2>
          </div>
          <button onClick={close} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-lg bg-destructive/10 border border-destructive/25 text-[12.5px] text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1 — UPLOAD */}
          {step === "upload" && (
            <div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="w-full flex flex-col items-center justify-center gap-3 py-12 px-6 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                {busy ? (
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                ) : (
                  <UploadCloud className="w-8 h-8 text-muted-foreground" />
                )}
                <div className="text-center">
                  <p className="text-[13.5px] font-semibold text-foreground">
                    {busy ? "Lendo planilha..." : "Clique para escolher um arquivo"}
                  </p>
                  <p className="text-[11.5px] text-muted-foreground mt-1">CSV, XLSX ou XLS — até 10 MB</p>
                </div>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <p className="text-[11.5px] text-muted-foreground mt-4 leading-relaxed">
                A primeira linha da planilha deve ter os títulos das colunas (ex: Nome, Telefone, Email).
                No próximo passo você confirma o que é cada coluna. Para a IA chamar no WhatsApp, inclua o
                número com código do país (ex: +55 11 9...).
              </p>
            </div>
          )}

          {/* STEP 2 — MAP */}
          {step === "map" && preview && (
            <div className="space-y-5">
              <p className="text-[12.5px] text-muted-foreground">
                Detectei <strong className="text-foreground">{preview.totalRows}</strong> linha(s) e{" "}
                <strong className="text-foreground">{preview.headers.length}</strong> coluna(s). Confirme o que é cada
                informação — ajustei automaticamente, mas confira:
              </p>

              <div className="space-y-3">
                {preview.fields.map((field) => (
                  <div key={field} className="grid grid-cols-[1fr_1.2fr] gap-3 items-center">
                    <div>
                      <p className="text-[12.5px] font-medium text-foreground">{FIELD_LABEL[field]}</p>
                      <p className="text-[10.5px] text-muted-foreground">{FIELD_HINT[field]}</p>
                    </div>
                    <select
                      value={mapping[field] ?? IGNORE}
                      onChange={(e) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (e.target.value === IGNORE) delete next[field];
                          else next[field] = e.target.value;
                          return next;
                        })
                      }
                      className="h-10 px-3 rounded-lg bg-muted/50 border border-border text-[12.5px] text-foreground focus:outline-none focus:border-ring/50"
                    >
                      <option value={IGNORE}>— ignorar —</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* sample preview of the mapped result */}
              {preview.sampleRows.length > 0 && (
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  <div className="px-3 py-2 bg-muted/40 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Prévia (primeiras linhas)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11.5px]">
                      <thead>
                        <tr className="border-b border-border/50">
                          {(["name", "phone", "email"] as LeadField[]).map((f) => (
                            <th key={f} className="text-left px-3 py-1.5 font-medium text-muted-foreground">{FIELD_LABEL[f]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sampleRows.map((row, i) => (
                          <tr key={i} className="border-b border-border/20 last:border-0">
                            {(["name", "phone", "email"] as LeadField[]).map((f) => (
                              <td key={f} className="px-3 py-1.5 text-foreground truncate max-w-[160px]">
                                {mapping[f] ? row[mapping[f]!] || <span className="text-muted-foreground/40">—</span> : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <label className="flex items-start gap-2.5 px-3 py-3 rounded-xl bg-muted/30 border border-border/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={contactNow}
                  onChange={(e) => setContactNow(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-primary cursor-pointer"
                />
                <div>
                  <p className="text-[12.5px] font-medium text-foreground">Iniciar atendimento pela IA agora</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    A IA faz o primeiro contato com cada lead importado (espaçado para não disparar tudo de uma vez).
                    Requer o funil de vendas configurado. Desmarque para só importar sem chamar.
                  </p>
                </div>
              </label>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button onClick={() => { setStep("upload"); setPreview(null); setFile(null); }} className="text-[12.5px] text-muted-foreground hover:text-foreground cursor-pointer">
                  ← Trocar arquivo
                </button>
                <button
                  onClick={commit}
                  disabled={busy}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl btn-brand text-[13px] font-semibold disabled:opacity-60 cursor-pointer"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Importar {preview.totalRows} lead(s)
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — DONE */}
          {step === "done" && result && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <p className="text-[15px] font-semibold text-foreground">{result.created} lead(s) importado(s)</p>
              <div className="text-[12.5px] text-muted-foreground mt-3 space-y-1">
                {result.contacted > 0 && <p>A IA vai chamar {result.contacted} lead(s) (envio espaçado).</p>}
                {result.skippedDuplicate > 0 && <p>{result.skippedDuplicate} já existiam (pulados).</p>}
                {result.skippedNoContact > 0 && <p>{result.skippedNoContact} sem telefone/email (pulados).</p>}
                {result.truncated && <p className="text-amber-500">Limite de 2000 por importação — divida a planilha para o restante.</p>}
              </div>
              <button onClick={close} className="mt-6 h-10 px-6 rounded-xl btn-brand text-[13px] font-semibold cursor-pointer">
                Concluir
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function errorMessage(code?: string): string {
  switch (code) {
    case "no_file": return "Nenhum arquivo enviado.";
    case "file_too_large": return "Arquivo muito grande (máximo 10 MB).";
    case "parse_failed": return "Não consegui ler a planilha. Salve como CSV ou XLSX e tente de novo.";
    case "empty_or_no_header": return "A planilha está vazia ou sem títulos de coluna na primeira linha.";
    case "need_phone_or_email_column": return "Mapeie ao menos a coluna de Telefone ou de Email.";
    case "invalid_mapping": return "Mapeamento inválido.";
    default: return "Algo deu errado. Tente novamente.";
  }
}
