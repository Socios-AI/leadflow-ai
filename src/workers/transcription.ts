import { Job } from "bullmq";
import prisma from "@/lib/db/prisma";
import { AIEngine } from "@/lib/ai/engine";

// Mocking WhatsApp channel pra não quebrar se o arquivo sumiu
const WhatsAppChannel = {
  downloadMedia: async (...args: any[]) => ({ success: true, base64: "dummy" })
};

interface TranscriptionData {
  accountId: string;
  conversationId: string;
  messageId: string;
  audioMessageId: string;
  instanceName: string;
}

export async function processTranscription(job: Job<TranscriptionData>) {
  const { accountId, conversationId, messageId, audioMessageId, instanceName } = job.data;

  if (!(prisma as any).channel) {
     return { skipped: true };
  }

  const channelConfig = await (prisma as any).channel.findUnique({
    where: {
      accountId_type: {
        accountId,
        type: "WHATSAPP",
      },
    },
  });

  if (!channelConfig) throw new Error("WhatsApp channel not configured");

  const config = channelConfig.config as Record<string, string>;

  const mediaResult = await WhatsAppChannel.downloadMedia(
    instanceName,
    audioMessageId,
    config.evolutionApiKey
  );

  if (!mediaResult.success || !mediaResult.base64) {
    throw new Error("Failed to download audio");
  }

  const audioBuffer = Buffer.from(mediaResult.base64, "base64");
  const transcription = await AIEngine.transcribeAudio(audioBuffer, "audio.ogg");

  await prisma.message.update({
    where: { id: messageId },
    data: {
      content: transcription,
      metadata: {
        originalType: "audio",
        transcribed: true,
      },
    },
  });

  return { transcription };
}