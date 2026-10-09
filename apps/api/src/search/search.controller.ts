import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { SearchProductsDto, SuggestDto } from './dto/search.dto';
import { SearchService } from './search.service';

@Public()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  products(@Query() query: SearchProductsDto) {
    return this.search.searchProducts(query);
  }

  @Get('suggest')
  suggest(@Query() query: SuggestDto) {
    return this.search.suggest(query);
  }
}
