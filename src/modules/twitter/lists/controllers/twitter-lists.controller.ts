import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TwitterListsService } from '../services/twitter-lists.service';
import { CreateListDto } from '../dto/create-list.dto';
import { UpdateListDto } from '../dto/update-list.dto';
import { AddMemberDto } from '../dto/add-member.dto';
import { SearchUsersDto } from '../dto/search-users.dto';
import { ImportListDto } from '../dto/import-list.dto';
import { ConfigService } from '@nestjs/config';

@Controller('api/lists')
export class TwitterListsController {
  constructor(
    private configService: ConfigService, 
    private readonly listsService: TwitterListsService
) {}

  // ---------------------------------------------------------------------------
  // List CRUD
  // ---------------------------------------------------------------------------

  /**
   * GET /api/lists
   * Returns all lists with pagination.
   */
  @Get()
  async getLists(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const skip = (page - 1) * limit;
    return this.listsService.getLists({ skip, limit });
  }

  /**
   * POST /api/lists
   * Creates a new list.
   */
  @Post()
  async createList(@Body() dto: CreateListDto) {
    const list = await this.listsService.createList(dto);
    return { data: list };
  }

  /**
   * GET /api/lists/users/search?query=&limit=
   * Search X users — MongoDB first, then XDK fallback.
   * NOTE: This route must be declared BEFORE /:id to avoid route conflicts.
   */
  @Get('users/search')
  async searchUsers(@Query() query: SearchUsersDto) {
    return this.listsService.searchUsers(query.query, query.limit);
  }

  /**
   * GET /api/lists/x/owned
   * Returns lists owned by the given X user ID.
   * NOTE: This route must be declared BEFORE /:id to avoid route conflicts.
   */
  @Get('x/owned')
  async getOwnedXLists() {
    const userId = this.configService.get<string>('CURRENT_X_USER_ID');
    return this.listsService.getOwnedXLists(userId as string);
  }

  /**
   * POST /api/lists/x/import
   * Imports a list from X by its list ID.
   * NOTE: This route must be declared BEFORE /:id to avoid route conflicts.
   */
  @Post('x/import')
  async importXList(@Body() dto: ImportListDto) {
    const list = await this.listsService.importXList(dto);
    return { data: list };
  }

  /**
   * GET /api/lists/:id
   * Returns a single list with populated members.
   */
  @Get(':id')
  async getListById(@Param('id') id: string) {
    const list = await this.listsService.getListById(id);
    return { data: list };
  }

  /**
   * PATCH /api/lists/:id
   * Updates a list's name and/or description.
   */
  @Patch(':id')
  async updateList(@Param('id') id: string, @Body() dto: UpdateListDto) {
    const list = await this.listsService.updateList(id, dto);
    return { data: list };
  }

  /**
   * DELETE /api/lists/:id
   * Deletes a list.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteList(@Param('id') id: string): Promise<void> {
    await this.listsService.deleteList(id);
  }

  // ---------------------------------------------------------------------------
  // Members
  // ---------------------------------------------------------------------------

  /**
   * POST /api/lists/:id/members
   * Adds an XUser to the list.
   * Body: { userId: string }
   */
  @Post(':id/members')
  async addMember(@Param('id') id: string, @Body() dto: AddMemberDto) {
    const list = await this.listsService.addMember(id, dto.userId);
    return { data: list };
  }

  /**
   * DELETE /api/lists/:id/members/:userId
   * Removes an XUser from the list.
   */
  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.listsService.removeMember(id, userId);
  }
}
