import { Injectable } from '@nestjs/common';
import { TranslationProvider } from '../interfaces/translation-provider.interface';

@Injectable()
export class MockTranslationProvider implements TranslationProvider {
  readonly name = 'MockTranslation';

  getSupportedLanguages(): string[] {
    return ['en', 'pa', 'fr'];
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async translate(text: string, from: string, to: string): Promise<string> {
    if (!text) return text;
    if (to === 'pa') {
      return `[ਪੰਜਾਬੀ] ${text}`;
    }
    if (to === 'fr') {
      return `[FR] ${text}`;
    }
    return text;
  }

  async translateBatch(
    texts: string[],
    from: string,
    to: string,
  ): Promise<string[]> {
    return Promise.all(texts.map((t) => this.translate(t, from, to)));
  }
}
