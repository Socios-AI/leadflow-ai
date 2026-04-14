// src/app/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Falha na autenticação");
      }

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-black" />
      <div className="absolute top-[-40%] left-[-20%] w-[70vw] h-[70vw] rounded-full bg-[#B9F495]/[0.03] blur-[120px]" />
      <div className="absolute bottom-[-30%] right-[-15%] w-[50vw] h-[50vw] rounded-full bg-[#B9F495]/[0.02] blur-[100px]" />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[420px] mx-4 animate-fade-in-up">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10 justify-center">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#B9F495] to-[#8ee060] flex items-center justify-center shadow-[0_4px_20px_rgba(185,244,149,0.3)]">
            <Zap className="w-5 h-5 text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight font-display leading-none">
              Marketing Digital AI
            </h1>
            <p className="text-[10px] font-semibold text-zinc-500 tracking-[2px] uppercase mt-0.5">
              Sales Automation
            </p>
          </div>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/80 backdrop-blur-xl p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white font-display">
              {mode === "login" ? "Entrar na sua conta" : "Criar conta"}
            </h2>
            <p className="text-sm text-zinc-500 mt-1 font-body">
              {mode === "login"
                ? "Acesse seu painel de automação"
                : "Comece a automatizar suas vendas"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5 tracking-wide uppercase">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full h-11 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#B9F495]/40 focus:ring-1 focus:ring-[#B9F495]/20 transition-all font-body"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5 tracking-wide uppercase">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full h-11 px-4 pr-11 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#B9F495]/40 focus:ring-1 focus:ring-[#B9F495]/20 transition-all font-body"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 font-body animate-fade-in">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl btn-brand text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-body"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {mode === "login" ? "Entrar" : "Criar conta"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle mode */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
            <p className="text-sm text-zinc-500 font-body">
              {mode === "login" ? "Não tem conta?" : "Já tem conta?"}{" "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
                className="text-[#B9F495] hover:text-[#a8ec7e] font-medium transition-colors cursor-pointer"
              >
                {mode === "login" ? "Criar conta" : "Entrar"}
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-zinc-600 mt-6 font-body">
          Ao continuar, você concorda com nossos Termos de Serviço e Política de Privacidade.
        </p>
      </div>
    </div>
  );
}