import { Injectable, Logger } from '@nestjs/common';
import { TranslationProvider } from '../interfaces/translation-provider.interface';

@Injectable()
export class NllbTranslationProvider implements TranslationProvider {
  readonly name = 'NLLB-200';
  private readonly logger = new Logger(NllbTranslationProvider.name);

  // Default endpoint for self-hosted NLLB microservice (FastAPI / CTranslate2)
  private readonly apiUrl =
    process.env.NLLB_API_URL || 'http://localhost:5005/translate';

  // NLLB-200 language code mappings
  private readonly langMap: Record<string, string> = {
    en: 'eng_Latn',
    pa: 'pan_Guru',
    fr: 'fra_Latn',
  };

  getSupportedLanguages(): string[] {
    return ['en', 'pa', 'fr'];
  }

  async isHealthy(): Promise<boolean> {
    try {
      const healthUrl = this.apiUrl.replace('/translate', '/health');
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async translate(text: string, from = 'en', to: string): Promise<string> {
    if (!text || !text.trim()) return text;

    const srcLang = this.langMap[from] || 'eng_Latn';
    const tgtLang = this.langMap[to];

    if (!tgtLang) {
      throw new Error(`NLLB does not support target language: ${to}`);
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          source_lang: srcLang,
          target_lang: tgtLang,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`NLLB HTTP error ${response.status}`);
      }

      const data: any = await response.json();
      return data?.translated_text ?? data?.translation ?? text;
    } catch (err: any) {
      this.logger.warn(
        `NLLB-200 service call failed for ${from}->${to}: ${err.message}`,
      );
      throw err;
    }
  }

  async translateBatch(
    texts: string[],
    from = 'en',
    to: string,
  ): Promise<string[]> {
    if (!texts || texts.length === 0) return [];

    const srcLang = this.langMap[from] || 'eng_Latn';
    const tgtLang = this.langMap[to];

    if (!tgtLang) {
      throw new Error(`NLLB does not support target language: ${to}`);
    }

    try {
      const batchUrl = this.apiUrl.replace('/translate', '/translate_batch');
      const response = await fetch(batchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts,
          source_lang: srcLang,
          target_lang: tgtLang,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const data: any = await response.json();
        if (Array.isArray(data?.translations)) {
          return data.translations;
        }
      }
    } catch {
      // If batch endpoint is not implemented, fall back to sequential/parallel translate
    }

    return Promise.all(texts.map((t) => this.translate(t, from, to)));
  }
}
