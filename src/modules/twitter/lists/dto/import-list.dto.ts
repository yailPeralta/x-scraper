import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class ImportListDto {
  /**
   * The X (Twitter) list ID to import.
   */
  @IsString()
  @IsNotEmpty()
  xListId: string;

  /**
   * Optional override name for the imported list.
   * If not provided, the name from X will be used.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
