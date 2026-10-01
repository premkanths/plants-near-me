import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';

export class RecommendQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit = 8;

  /**
   * Ask the LLM to write the blurbs. Opt-in because it costs a round trip;
   * ignored entirely when no API key is configured.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1' || value === true)
  @IsBoolean()
  explain = false;
}

export class SimilarQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit = 4;
}
