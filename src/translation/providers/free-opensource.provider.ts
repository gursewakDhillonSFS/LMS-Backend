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
   * Translates text using free open-source endpoints with cascading fallback.
   * MyMemory rejects queries longer than 500 characters, so long course
   * descriptions are split before they are sent.
   */
  async translate(text: string, from = 'en', to: string): Promise<string> {
    if (!text || !text.trim()) return text;
    if (from === to) return text;

    const chunks = this.splitForQueryLimit(text, 450);
    if (chunks.length > 1) {
      const translated = await Promise.all(
        chunks.map((chunk) => this.translateChunk(chunk, from, to)),
      );
      return translated.join('');
    }

    return this.translateChunk(text, from, to);
  }

  private async translateChunk(
    text: string,
    from: string,
    to: string,
  ): Promise<string> {
    try {
      const encodedText = encodeURIComponent(text);
      const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${from}|${to}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data: any = await res.json();
        const translated = data?.responseData?.translatedText;
        const rejected =
          !translated ||
          typeof translated !== 'string' ||
          translated.includes('MYMEMORY WARNING') ||
          translated.includes('QUERY LENGTH LIMIT') ||
          data?.responseStatus === 403 ||
          data?.quotaFinished;

        if (!rejected) {
          return this.decodeHtmlEntities(translated);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Primary open-source endpoint failed: ${err.message}`);
    }

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
        if (data?.translatedText && !String(data.translatedText).includes('QUERY LENGTH LIMIT')) {
          return this.decodeHtmlEntities(data.translatedText);
        }
      }
    } catch (err: any) {
      this.logger.warn(`LibreTranslate endpoint failed: ${err.message}`);
    }

    this.logger.warn(
      `All translation endpoints failed for ${from}->${to}. Retaining original text.`,
    );
    return text;
  }

  private splitForQueryLimit(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let rest = text;
    while (rest.length > maxLen) {
      let cut = rest.lastIndexOf(' ', maxLen);
      if (cut < maxLen * 0.5) cut = maxLen;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) chunks.push(rest);
    return chunks;
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
