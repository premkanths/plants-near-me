import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { CreateReviewDto, ListReviewsDto, UpdateReviewDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Anyone can read a shop's reviews, logged in or not. */
  @Get('shop/:slug')
  @Public()
  listForVendor(@Param('slug') slug: string, @Query() query: ListReviewsDto) {
    return this.reviews.listForVendor(slug, query.page, query.pageSize);
  }

  /** What I have written, and what I still could. */
  @Get('mine')
  @Roles('CUSTOMER')
  mine(@CurrentUser('id') userId: string) {
    return this.reviews.mine(userId);
  }

  @Post()
  @Roles('CUSTOMER')
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(userId, dto);
  }

  @Patch(':id')
  @Roles('CUSTOMER')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviews.update(userId, id, dto);
  }

  @Delete(':id')
  @Roles('CUSTOMER')
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.remove(userId, id);
  }
}
