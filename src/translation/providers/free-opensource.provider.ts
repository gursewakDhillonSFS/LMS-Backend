import { Injectable, Logger } from '@nestjs/common';
import { TranslationProvider } from '../interfaces/translation-provider.interface';

@Injectable()
export class FreeOpenSourceProvider implements TranslationProvider {
  readonly name = 'FreeOpenSourceEngine';
  private readonly logger = new Logger(FreeOpenSourceProvider.name);

  getSupportedLanguages(): string[] {
    return ['en', 'pa', 'fr'];
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  /**
   * Translates text using free open-source endpoints with cascading fallback
   */
  async translate(text: string, from = 'en', to: string): Promise<string> {
    if (!text || !text.trim()) return text;
    if (from === to) return text;

    // Strategy 1: Free Open-Source MyMemory API (supports 150+ languages including pa & fr with high accuracy)
    try {
      const encodedText = encodeURIComponent(text);
      const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${from}|${to}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data: any = await res.json();
        const translated = data?.responseData?.translatedText;

        if (
          translated &&
          typeof translated === 'string' &&
          !translated.includes('MYMEMORY WARNING')
        ) {
          return this.decodeHtmlEntities(translated);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Primary open-source endpoint failed: ${err.message}`);
    }

    // Strategy 2: LibreTranslate Open Instance / Mirror
    try {
      const libreUrl =
        process.env.LIBRETRANSLATE_URL ||
        'https://libretranslate.de/translate';

      const res = await fetch(libreUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: from,
          target: to,
          format: 'text',
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const data: any = await res.json();
        if (data?.translatedText) {
          return this.decodeHtmlEntities(data.translatedText);
        }
      }
    } catch (err: any) {
      this.logger.warn(`LibreTranslate endpoint failed: ${err.message}`);
    }

    // If both services are unreachable or down, return source text as safe fallback
    this.logger.warn(
      `All translation endpoints failed for ${from}->${to}. Retaining original text.`,
    );
    return text;
  }

  async translateBatch(
    texts: string[],
    from = 'en',
    to: string,
  ): Promise<string[]> {
    if (!texts || texts.length === 0) return [];
    const results: string[] = [];
    for (const text of texts) {
      const res = await this.translate(text, from, to);
      results.push(res);
      // Brief sleep between calls
      await new Promise((r) => setTimeout(r, 100));
    }
    return results;
  }

  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  }
}
