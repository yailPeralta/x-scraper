import { IsString, IsNotEmpty } from 'class-validator';

export class AddMemberDto {
  /**
   * MongoDB ObjectId of the XUser to add to the list.
   */
  @IsString()
  @IsNotEmpty()
  userId: string;
}
