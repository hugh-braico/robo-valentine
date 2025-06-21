/**
 * @fileoverview Implements a simple rate-limiting mechanism using an in-memory cache.
 * Limits the number of actions a user can perform within a specified time window.
 * Periodically cleans up expired entries from the cache.
 * 
 * @module utils/core/rate-limiter
 */
import { logger } from './logger.js';
import config from '../../config/config.json' with { type: "json" };

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

const rateLimiter = new Map<string, RateLimitEntry>();
const limit = config['rate-limiter']['limit'];
const window = config['rate-limiter']['window-milliseconds'];

export function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = rateLimiter.get(userId);
    
    if (!entry || now > entry.resetTime) {
        // New window or expired entry
        rateLimiter.set(userId, {
            count: 1,
            resetTime: now + window
        });
        return true;
    }
    
    if (entry.count >= limit) {
        return false;
    }
    
    entry.count++;
    return true;
}

// Periodic cleanup of expired entries
// Note: A daily interval is perfectly fine, overkill even, for the expected level of traffic.
setInterval(() => {
    logger.info("Clearing rate limit cache.");
    const now = Date.now();
    for (const [userId, entry] of rateLimiter.entries()) {
        if (now > entry.resetTime) {
            rateLimiter.delete(userId);
            logger.info(`  Deleting userId ${userId} from rate limit cache.`);
        }
    }
}, 86400000); // one day in ms