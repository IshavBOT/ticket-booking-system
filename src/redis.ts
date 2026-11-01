import Redis from 'ioredis';
import { config } from './config';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // null is required by BullMQ
  ...(config.redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
});

const holdKey = (eventId: number, seatId: number) => `hold:${eventId}:${seatId}`;

// All-or-nothing and atomic: fails if any seat is held by someone else; re-holding your own seats refreshes the TTL.
const HOLD_SCRIPT = `
for _, k in ipairs(KEYS) do
  local owner = redis.call('GET', k)
  if owner and owner ~= ARGV[1] then return 0 end
end
for _, k in ipairs(KEYS) do redis.call('SET', k, ARGV[1], 'EX', ARGV[2]) end
return 1`;

export async function holdSeats(eventId: number, seatIds: number[], userId: number) {
  const keys = seatIds.map((s) => holdKey(eventId, s));
  return (await redis.eval(HOLD_SCRIPT, keys.length, ...keys, String(userId), config.holdTtl)) === 1;
}

export const holdOwners = (eventId: number, seatIds: number[]) =>
  redis.mget(seatIds.map((s) => holdKey(eventId, s)));

export const releaseHolds = (eventId: number, seatIds: number[]) =>
  redis.del(seatIds.map((s) => holdKey(eventId, s)));
