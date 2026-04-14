// src/app/api/campaigns/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

/**
 * POST /api/campaigns/analyze
 *
 * Analyzes campaign content using OpenAI:
 * - Audio/Video → Whisper transcription → GPT-4o analysis
 * - Image → GPT-4o Vision
 * - Text → GPT-4o analysis
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const type = formData.get("type") as string;
    const file = formData.get("file") as File | null;
    const text = formData.get("text") as string | null;
    const caption = formData.get("caption") as string | null;
    const campaignName = (formData.get("campaignName") as string) || "Sem nome";

    let contentToAnalyze = "";

    // ═══════════════════════════════════════
    // 1. AUDIO / VIDEO → Whisper
    // ═══════════════════════════════════════
    if ((type === "audio" || type === "video") && file) {
      const whisperForm = new FormData();
      whisperForm.append("file", file);
      whisperForm.append("model", "whisper-1");
      whisperForm.append("response_format", "text");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperForm,
      });

      if (!whisperRes.ok) {
        const err = await whisperRes.text();
        console.error("Whisper error:", err);
        return NextResponse.json({ error: "Erro na transcrição de áudio", detail: err }, { status: 500 });
      }

      contentToAnalyze = await whisperRes.text();
      if (caption) contentToAnalyze += `\n\nLegenda/Copy do anúncio:\n${caption}`;
    }

    // ═══════════════════════════════════════
    // 2. IMAGE → GPT-4o Vision
    // ═══════════════════════════════════════
    else if (type === "image" && file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      const mimeType = file.type || "image/jpeg";

      const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
                {
                  type: "text",
                  text: `Você é um estrategista sênior de marketing digital com 15 anos de experiência. Analise esta imagem do anúncio/campanha "${campaignName}" com profundidade cirúrgica.

Retorne a análise EXATAMENTE neste formato:

🎯 PRODUTO/OFERTA
Descreva com precisão o que está sendo vendido, incluindo categoria, faixa de preço estimada (se visível), e modelo de negócio (assinatura, compra única, serviço, etc).

👥 PERFIL DO LEAD
Defina o perfil demográfico e psicográfico: idade estimada, gênero predominante, nível de renda, dores/frustrações que esse produto resolve, e o momento de vida em que essa pessoa provavelmente está.

💎 PROPOSTA DE VALOR
Qual a promessa central? O que diferencia dos concorrentes? Identifique os gatilhos mentais usados (escassez, autoridade, prova social, urgência, etc).

🗣️ SCRIPT DE ABORDAGEM
Escreva exatamente como a IA deve abordar um lead dessa campanha. Inclua: saudação ideal, perguntas de qualificação, e 2-3 respostas para objeções comuns.

⚠️ O QUE NÃO FAZER
Liste 3-4 erros que a IA deve evitar ao atender leads dessa campanha (promessas que não pode fazer, informações que não deve inventar, tom que deve evitar).

📊 DADOS TÉCNICOS
Plataforma provável (Meta Ads, Google, TikTok), formato do criativo, CTA identificado, e landing page provável.
${caption ? `\nLegenda/Copy do anúncio: ${caption}` : ""}
Responda em português do Brasil. Seja específico — quanto mais detalhado, melhor a IA vai atender os leads.`,
                },
              ],
            },
          ],
        }),
      });

      if (!visionRes.ok) {
        const err = await visionRes.text();
        console.error("Vision error:", err);
        return NextResponse.json({ error: "Erro na análise da imagem", detail: err }, { status: 500 });
      }

      const visionData = await visionRes.json();
      contentToAnalyze = visionData.choices?.[0]?.message?.content || "";

      // Image already analyzed, return directly
      return NextResponse.json({ analysis: contentToAnalyze, transcription: contentToAnalyze });
    }

    // ═══════════════════════════════════════
    // 3. TEXT → direct
    // ═══════════════════════════════════════
    else if (type === "text" && text) {
      contentToAnalyze = text;
    }

    // No content
    else {
      return NextResponse.json({ error: "Nenhum conteúdo enviado para análise" }, { status: 400 });
    }

    // ═══════════════════════════════════════
    // Final GPT-4o analysis
    // ═══════════════════════════════════════
    const analysisRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 2000,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: `Você é um estrategista sênior de marketing digital com 15 anos de experiência analisando campanhas de alta performance. Analise o conteúdo dessa campanha com profundidade cirúrgica — sua análise vai alimentar uma IA de vendas que precisa atender leads em tempo real.

Retorne a análise EXATAMENTE neste formato:

🎯 PRODUTO/OFERTA
Descreva com precisão o que está sendo vendido. Identifique: categoria do produto/serviço, modelo de negócio (assinatura, compra única, high ticket, etc), faixa de preço se mencionada, e diferenciais competitivos.

👥 PERFIL DO LEAD
Defina quem é o lead ideal: perfil demográfico (idade, gênero, região), nível de consciência (sabe do problema? já buscou soluções?), dores e frustrações principais, e o que essa pessoa espera ouvir para tomar a decisão de compra.

💎 PROPOSTA DE VALOR & GATILHOS
Qual a promessa central da campanha? Liste os gatilhos mentais usados (escassez, autoridade, prova social, urgência, reciprocidade, etc). Identifique se há bônus, garantias, ou condições especiais.

🗣️ COMO A IA DEVE ATENDER
Escreva instruções práticas para a IA:
- Tom de voz ideal (formal, casual, consultivo, energético)
- Saudação recomendada para o primeiro contato
- 3 perguntas de qualificação que a IA deve fazer
- 3-4 respostas para as objeções mais prováveis (preço, timing, confiança)
- Frase de fechamento/CTA que a IA deve usar

⚠️ REGRAS E RESTRIÇÕES
Liste 4-5 coisas que a IA NÃO pode fazer:
- Promessas que não foram feitas na campanha
- Informações que não deve inventar
- Temas que deve evitar
- Quando deve escalar para um humano

📊 INTELIGÊNCIA COMPETITIVA
Com base no conteúdo, infira: nível de sofisticação do marketing (iniciante/intermediário/avançado), plataforma provável de veiculação, e sugestões de melhoria para a campanha.

Seja extremamente específico e detalhado. Quanto mais precisa sua análise, melhor a IA vai converter leads em vendas. Responda em português do Brasil.`,
          },
          {
            role: "user",
            content: `Campanha: "${campaignName}"

Conteúdo transcrito/extraído da campanha (pode ser um vídeo de vendas, áudio de pitch, copy de anúncio, ou script):

---
${contentToAnalyze}
---

Analise com profundidade. Essa análise vai ser usada para treinar uma IA de vendas que vai atender os leads dessa campanha em tempo real via WhatsApp, Email e SMS.`,
          },
        ],
      }),
    });

    if (!analysisRes.ok) {
      const err = await analysisRes.text();
      console.error("GPT error:", err);
      return NextResponse.json({ error: "Erro na análise", detail: err }, { status: 500 });
    }

    const analysisData = await analysisRes.json();
    const analysis = analysisData.choices?.[0]?.message?.content || "Não foi possível analisar.";

    return NextResponse.json({ analysis, transcription: contentToAnalyze });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Campaign analysis error:", msg);
    return NextResponse.json({ error: "Erro interno", message: msg }, { status: 500 });
  }
}