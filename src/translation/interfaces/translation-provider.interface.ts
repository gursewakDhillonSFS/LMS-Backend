export interface TranslationProvider {
  readonly name: string;

  /**
   * Translates single text from source to target language
   * @param text Source text in English
   * @param from Source language code (e.g. 'en')
   * @param to Target language code ('pa' | 'fr')
   */
  translate(text: string, from: string, to: string): Promise<string>;

  /**
   * Translates an array of texts in batch
   */
  translateBatch(texts: string[], from: string, to: string): Promise<string[]>;

  /**
   * Returns list of supported ISO language codes
   */
  getSupportedLanguages(): string[];

  /**
   * Health check to verify if the provider is reachable and active
   */
  isHealthy?(): Promise<boolean>;
}
