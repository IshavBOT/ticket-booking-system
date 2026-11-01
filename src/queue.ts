import { Queue, Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { config } from './config';
import { redis } from './redis';

// 5 attempts with exponential backoff (2s, 4s, 8s...). Jobs that exhaust retries stay in BullMQ's "failed" set for inspection.
export const emailQueue = new Queue('email', {
  connection: redis,
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: false },
});

const mailer = nodemailer.createTransport(config.smtpUrl ?? { jsonTransport: true });

export const startWorker = () =>
  new Worker(
    'email',
    async (job) => {
      const info = await mailer.sendMail({ from: 'manavishav@gmail.com', ...job.data });
      if (!config.smtpUrl) console.log('[email]', info.message);
    },
    { connection: redis },
  );
