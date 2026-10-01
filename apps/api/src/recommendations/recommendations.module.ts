import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { LlmGateway, NullLlmGateway, OpenAiLlmGateway } from './llm.gateway';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

/**
 * Same pattern as payments: a real gateway when credentials exist, otherwise a
 * no-op so the whole feature works offline. Recommendations never depend on
 * the LLM for correctness — only for nicer wording.
 */
const llmProvider = {
  provide: LlmGateway,
  inject: [ConfigService],
  useFactory: (config: ConfigService): LlmGateway => {
    const apiKey = config.get<string>('OPENAI_API_KEY')?.trim();
    const logger = new Logger('RecommendationsModule');

    if (!apiKey) {
      logger.log('No OPENAI_API_KEY — recommendations use rule-based reasons only');
      return new NullLlmGateway();
    }

    logger.log('OPENAI_API_KEY found — LLM blurbs available with ?explain=true');
    return new OpenAiLlmGateway(apiKey, config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini');
  },
};

@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationsService, llmProvider],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
