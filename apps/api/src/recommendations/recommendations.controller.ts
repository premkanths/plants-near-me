import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentUser, Public } from '../auth/decorators';
import { RecommendQueryDto, SimilarQueryDto } from './dto/recommendations.dto';
import { RecommendationsService } from './recommendations.service';

@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  /**
   * Public on purpose: a logged-out visitor still gets the popular-and-nearby
   * list, which is what the home page shows before anyone signs in.
   */
  @Get()
  @Public()
  forMe(@CurrentUser('id') userId: string | undefined, @Query() query: RecommendQueryDto) {
    return this.recommendations.forUser(userId ?? null, {
      lat: query.lat,
      lng: query.lng,
      limit: query.limit,
      explain: query.explain,
    });
  }

  @Get('similar/:productId')
  @Public()
  similar(@Param('productId', ParseUUIDPipe) productId: string, @Query() query: SimilarQueryDto) {
    return this.recommendations.similarTo(productId, query.limit);
  }
}
