import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;
  private defaultTtl: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultTtl = Number(this.configService.get('REDIS_TTL')) || 1800; // 30 mins
  }

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      this.logger.warn(
        '⚠️ REDIS_URL not configured. Redis cache and transient features will run in fallback/passthrough mode.',
      );
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy(times) {
          if (times > 3) {
            return null; // Stop reconnecting after 3 failed attempts to avoid log spam
          }
          return Math.min(times * 1000, 3000);
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('🚀 Successfully connected to Redis.');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection error: ${err.message}. Gracefully falling back.`);
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });

      // Attempt initial connection (non-blocking if it fails)
      await this.client.connect().catch((err) => {
        this.isConnected = false;
        this.logger.warn(
          `Could not connect to Redis at ${redisUrl} (${err.message}). Application will continue running with direct DB fallback.`,
        );
      });
    } catch (err: any) {
      this.isConnected = false;
      this.logger.warn(`Failed to initialize Redis client: ${err?.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.log('Redis connection gracefully closed.');
      } catch (err: any) {
        this.logger.warn(`Error closing Redis client: ${err?.message}`);
      }
    }
  }

  /**
   * Check if Redis is currently connected and ready
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get parsed JSON value for a given key
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isAvailable() || !this.client) return null;

    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err: any) {
      this.logger.debug(`Redis GET error for key [${key}]: ${err.message}`);
      return null;
    }
  }

  /**
   * Store a value in Redis with optional TTL in seconds
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable() || !this.client) return;

    try {
      const ttl = ttlSeconds ?? this.defaultTtl;
      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        await this.client.set(key, serialized, 'EX', ttl);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (err: any) {
      this.logger.debug(`Redis SET error for key [${key}]: ${err.message}`);
    }
  }

  /**
   * Delete a specific key
   */
  async del(key: string): Promise<void> {
    if (!this.isAvailable() || !this.client) return;

    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logger.debug(`Redis DEL error for key [${key}]: ${err.message}`);
    }
  }

  /**
   * Delete keys matching a wildcard pattern (e.g. "course:details:*")
   * Uses SCAN stream to avoid blocking the Redis event loop
   */
  async delByPattern(pattern: string): Promise<void> {
    if (!this.isAvailable() || !this.client) return;

    try {
      const stream = this.client.scanStream({
        match: pattern,
        count: 100,
      });

      stream.on('data', async (keys: string[]) => {
        if (keys.length > 0 && this.client) {
          const pipeline = this.client.pipeline();
          keys.forEach((k) => pipeline.del(k));
          await pipeline.exec().catch(() => {});
        }
      });
    } catch (err: any) {
      this.logger.debug(`Redis DEL by pattern error [${pattern}]: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SPECIALIZED HELPERS: OTP & TRANSIENT AUTH DATA
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Store a one-time password (OTP) with auto-expiry (defaults to 10 minutes = 600 seconds)
   */
  async setOtp(identifier: string, otp: string, ttlSeconds = 600): Promise<void> {
    const key = `otp:${identifier.toLowerCase().trim()}`;
    if (!this.isAvailable() || !this.client) return;

    try {
      await this.client.set(key, otp, 'EX', ttlSeconds);
    } catch (err: any) {
      this.logger.warn(`Redis setOtp error for ${identifier}: ${err.message}`);
    }
  }

  /**
   * Retrieve an active OTP for an identifier
   */
  async getOtp(identifier: string): Promise<string | null> {
    const key = `otp:${identifier.toLowerCase().trim()}`;
    if (!this.isAvailable() || !this.client) return null;

    try {
      return await this.client.get(key);
    } catch (err: any) {
      this.logger.warn(`Redis getOtp error for ${identifier}: ${err.message}`);
      return null;
    }
  }

  /**
   * Invalidate/Delete an OTP upon verification
   */
  async delOtp(identifier: string): Promise<void> {
    const key = `otp:${identifier.toLowerCase().trim()}`;
    await this.del(key);
  }
}
