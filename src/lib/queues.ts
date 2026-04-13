// src/lib/queues.ts
import { Queue } from "bullmq";
import { getQueueConnection } from "@/lib/redis";

const connection = getQueueConnection();

export const queues = {
  leadProcessing: new Queue("lead-processing", {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    },
  }),

  messageSending: new Queue("message-sending", {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    },
  }),

  aiResponse: new Queue("ai-response", {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
    },
  }),

  transcription: new Queue("transcription", {
    connection,
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 200,
      attempts: 2,
    },
  }),

  followUp: new Queue("follow-up", {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }),
};