import { Injectable, Logger } from '@nestjs/common';
import { TranslationProvider } from '../interfaces/translation-provider.interface';
import { isUnusableTranslation } from '../translation-text.util';

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
   * MyMemory rejects the URL-encoded `q` value once it passes 500 characters.
   * A 450-character description with spaces or HTML still encodes past that
   * limit, which is why the error text was coming back as the translation.
   */
  async translate(text: string, from = 'en', to: string): Promise<string> {
    if (!text || !text.trim()) return text;
    if (from === to) return text;

    const chunks = this.splitForEncodedLimit(text, 380);
    if (chunks.length === 1) {
      return this.translateChunk(chunks[0], from, to);
    }

    const translated = await Promise.all(
      chunks.map((chunk) => this.translateChunk(chunk, from, to)),
    );
    const joined = translated.join('');
    return isUnusableTranslation(joined) ? text : joined;
  }

  private async translateChunk(
    text: string,
    from: string,
    to: string,
    depth = 0,
  ): Promise<string> {
    const attempt = await this.requestTranslation(text, from, to);
    if (attempt.ok) return attempt.text;

    if (attempt.lengthLimited && text.length > 1 && depth < 8) {
      const mid = Math.max(1, Math.floor(text.length / 2));
      let cut = text.lastIndexOf(' ', mid);
      if (cut < Math.floor(text.length * 0.25)) cut = mid;
      const [left, right] = await Promise.all([
        this.translateChunk(text.slice(0, cut), from, to, depth + 1),
        this.translateChunk(text.slice(cut), from, to, depth + 1),
      ]);
      const joined = `${left}${right}`;
      return isUnusableTranslation(joined) ? text : joined;
    }

    return text;
  }

  private async requestTranslation(
    text: string,
    from: string,
    to: string,
  ): Promise<{ ok: boolean; text: string; lengthLimited: boolean }> {
    if (encodeURIComponent(text).length > 450) {
      return { ok: false, text, lengthLimited: true };
    }

    try {
      const encodedText = encodeURIComponent(text);
      const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${from}|${to}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data: any = await res.json();
        const translated = data?.responseData?.translatedText;
        const lengthLimited =
          data?.responseStatus === 403 ||
          (typeof translated === 'string' && isUnusableTranslation(translated));

        if (
          typeof translated === 'string' &&
          translated.trim() &&
          !lengthLimited &&
          !data?.quotaFinished
        ) {
          return {
            ok: true,
            text: this.decodeHtmlEntities(translated),
            lengthLimited: false,
          };
        }

        if (lengthLimited) {
          return { ok: false, text, lengthLimited: true };
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
        const translated = data?.translatedText;
        if (
          typeof translated === 'string' &&
          translated.trim() &&
          !isUnusableTranslation(translated)
        ) {
          return {
            ok: true,
            text: this.decodeHtmlEntities(translated),
            lengthLimited: false,
          };
        }
      }
    } catch (err: any) {
      this.logger.warn(`LibreTranslate endpoint failed: ${err.message}`);
    }

    return { ok: false, text, lengthLimited: false };
  }

  private splitForEncodedLimit(text: string, maxEncoded: number): string[] {
    if (encodeURIComponent(text).length <= maxEncoded) return [text];

    const chunks: string[] = [];
    let current = '';
    const parts = text.split(/(\s+)/);

    const pushHardSplit = (value: string) => {
      let buffer = '';
      for (const char of value) {
        const next = buffer + char;
        if (encodeURIComponent(next).length > maxEncoded) {
          if (buffer) chunks.push(buffer);
          buffer = char;
        } else {
          buffer = next;
        }
      }
      current = buffer;
    };

    for (const part of parts) {
      const next = current + part;
      if (encodeURIComponent(next).length <= maxEncoded) {
        current = next;
        continue;
      }
      if (current) chunks.push(current);
      if (encodeURIComponent(part).length <= maxEncoded) {
        current = part;
      } else {
        pushHardSplit(part);
      }
    }

    if (current) chunks.push(current);
    return chunks.filter((chunk) => chunk.length > 0);
  }

  async translateBatch(
    texts: string[],
    from = 'en',
    to: string,
  ): Promise<string[]> {
    if (!texts || texts.length === 0) return [];
    const results: string[] = [];
    for (const text of texts) {
      results.push(await this.translate(text, from, to));
      await new Promise((resolve) => setTimeout(resolve, 100));
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
