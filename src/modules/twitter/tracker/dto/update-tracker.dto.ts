import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TrackerConfigDto } from './create-tracker.dto';

export class UpdateTrackerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TrackerConfigDto)
  config?: TrackerConfigDto;
}
