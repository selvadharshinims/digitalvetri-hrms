import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Thin Anthropic SDK wrapper. Reads ANTHROPIC_API_KEY from env at boot and
 * exposes a lazy `client` accessor. When the key is missing the service stays
 * in "unavailable" mode and any caller that touches `client` gets a clean 503
 * — the rest of the API keeps working. Drop a key in env and it lights up
 * without code changes.
 *
 * The default model is configurable via ANTHROPIC_MODEL but defaults to the
 * latest Claude — see https://platform.claude.com/docs/en/about-claude/models.
 */
@Injectable()
export class AnthropicService implements OnModuleInit {
  private readonly logger = new Logger(AnthropicService.name);
  private clientInstance: Anthropic | null = null;
  private modelId = 'claude-opus-4-7';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.modelId = this.config.get<string>('ANTHROPIC_MODEL', 'claude-opus-4-7');
    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY not set — AI features will return 503 until configured',
      );
      return;
    }
    this.clientInstance = new Anthropic({ apiKey });
    this.logger.log(`Anthropic client initialized (model: ${this.modelId})`);
  }

  /** Throws ServiceUnavailableException (503) if the API key wasn't configured. */
  get client(): Anthropic {
    if (!this.clientInstance) {
      throw new ServiceUnavailableException(
        'AI features are unavailable on this deployment. Configure ANTHROPIC_API_KEY to enable them.',
      );
    }
    return this.clientInstance;
  }

  get model(): string {
    return this.modelId;
  }

  isAvailable(): boolean {
    return this.clientInstance !== null;
  }
}
