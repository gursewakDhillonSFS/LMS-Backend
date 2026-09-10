import { Injectable, Logger } from '@nestjs/common';
import { TranslationProvider } from '../interfaces/translation-provider.interface';
import { NllbTranslationProvider } from './nllb.provider';
import { FreeOpenSourceProvider } from './free-opensource.provider';

@Injectable()
export class CompositeTranslationProvider implements TranslationProvider {
  readonly name = 'CompositeTranslator';
  private readonly logger = new Logger(CompositeTranslationProvider.name);

  constructor(
    private readonly nllbProvider: NllbTranslationProvider,
    private readonly freeProvider: FreeOpenSourceProvider,
  ) {}

  getSupportedLanguages(): string[] {
    return ['en', 'pa', 'fr'];
  }

  async translate(text: string, from = 'en', to: string): Promise<string> {
    if (!text || !text.trim()) return text;
    if (from === to) return text;

    // Check if NLLB microservice is reachable
    const nllbActive = await this.nllbProvider.isHealthy();
    if (nllbActive) {
      try {
        return await this.nllbProvider.translate(text, from, to);
      } catch (err: any) {
        this.logger.warn(`NLLB provider failed, falling back to Free Open-Source provider: ${err.message}`);
      }
    }

    // Primary or fallback: Free Open-Source Provider
    return this.freeProvider.translate(text, from, to);
  }

  async translateBatch(
    texts: string[],
    from = 'en',
    to: string,
  ): Promise<string[]> {
    if (!texts || texts.length === 0) return [];

    const nllbActive = await this.nllbProvider.isHealthy();
    if (nllbActive) {
      try {
        return await this.nllbProvider.translateBatch(texts, from, to);
      } catch (err: any) {
        this.logger.warn(`NLLB batch failed, falling back to Free Open-Source provider: ${err.message}`);
      }
    }

    return this.freeProvider.translateBatch(texts, from, to);
  }
}
