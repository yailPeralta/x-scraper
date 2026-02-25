import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ApiError } from '@xdevplatform/xdk';
import { TwitterListRepository } from '../repositories/twitter-list.repository';
import { XUserRepository } from '../../scraper/repositories/x-user.repository';
import { XdkClientService } from '../../../../common/services/twitter/xdk-client.service';
import { CreateListDto } from '../dto/create-list.dto';
import { UpdateListDto } from '../dto/update-list.dto';
import { ImportListDto } from '../dto/import-list.dto';

/** Re-throw an XDK ApiError as a NestJS HttpException with the correct status code. */
function rethrowXdkError(error: unknown): never {
  if (error instanceof ApiError) {
    throw new HttpException(error.message, error.status || 500);
  }
  throw error;
}

@Injectable()
export class TwitterListsService {
  private readonly logger = new Logger(TwitterListsService.name);

  constructor(
    private readonly listRepository: TwitterListRepository,
    private readonly xUserRepository: XUserRepository,
    private readonly xdkClient: XdkClientService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async createList(dto: CreateListDto) {
    const list = await this.listRepository.create({
      name: dto.name,
      description: dto.description || '',
      importedFromX: dto.importedFromX || false,
      xListId: dto.xListId || null,
    });
    return list;
  }

  async getLists(options: { skip?: number; limit?: number } = {}) {
    const [lists, total] = await Promise.all([
      this.listRepository.findAll(options),
      this.listRepository.count(),
    ]);
    return { data: lists, total };
  }

  async getListById(id: string) {
    const list = await this.listRepository.findByIdPopulated(id);
    if (!list) {
      throw new NotFoundException(`List with id "${id}" not found`);
    }
    return list;
  }

  async updateList(id: string, dto: UpdateListDto) {
    const updated = await this.listRepository.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
    });
    if (!updated) {
      throw new NotFoundException(`List with id "${id}" not found`);
    }
    return updated;
  }

  async deleteList(id: string): Promise<void> {
    const deleted = await this.listRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException(`List with id "${id}" not found`);
    }
  }

  // ---------------------------------------------------------------------------
  // Members
  // ---------------------------------------------------------------------------

  async addMember(listId: string, userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException(`Invalid userId: "${userId}"`);
    }

    const list = await this.listRepository.findById(listId);
    if (!list) {
      throw new NotFoundException(`List with id "${listId}" not found`);
    }

    const user = await this.xUserRepository.findByIds([
      new Types.ObjectId(userId),
    ]);
    if (!user || user.length === 0) {
      throw new NotFoundException(`XUser with id "${userId}" not found`);
    }

    const updated = await this.listRepository.addMember(
      listId,
      new Types.ObjectId(userId),
    );
    return updated;
  }

  async removeMember(listId: string, userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException(`Invalid userId: "${userId}"`);
    }

    const list = await this.listRepository.findById(listId);
    if (!list) {
      throw new NotFoundException(`List with id "${listId}" not found`);
    }

    const updated = await this.listRepository.removeMember(
      listId,
      new Types.ObjectId(userId),
    );
    return updated;
  }

  // ---------------------------------------------------------------------------
  // User search (MongoDB first, then XDK fallback)
  // ---------------------------------------------------------------------------

  async searchUsers(query: string, limit = 20) {
    // 1. Search in MongoDB first
    const localResults = await this.xUserRepository.search(query, limit);

    if (localResults.length >= limit) {
      return { data: localResults, source: 'local' };
    }

    // 2. Fallback to X API
    this.logger.log(
      `Local search returned ${localResults.length} results for "${query}", falling back to X API`,
    );

    try {
      const response = await this.xdkClient.readClient.users.search(query, {
        maxResults: limit,
        userFields: [
          'id',
          'name',
          'username',
          'description',
          'profile_image_url',
          'public_metrics',
          'verified',
        ],
      });

      const xUsers = response?.data || [];

      // Upsert each returned user into MongoDB
      const upserted = await Promise.all(
        xUsers.map((u: any) =>
          this.xUserRepository.upsert({
            restId: u.id,
            username: u.username,
            displayName: u.name,
            bio: u.description || '',
            followers: u.publicMetrics?.followersCount || 0,
            following: u.publicMetrics?.followingCount || 0,
            verified: u.verified || false,
            profileImageUrl: u.profileImageUrl || '',
          }),
        ),
      );

      // Merge local + remote, deduplicate by username
      const merged = [...localResults];
      for (const u of upserted) {
        if (!merged.find((m: any) => m.username === (u as any).username)) {
          merged.push(u as any);
        }
      }

      return { data: merged.slice(0, limit), source: 'mixed' };
    } catch (error) {
      this.logger.warn(
        `X API user search failed for "${query}": ${error?.message || error}`,
      );
      // Return local results even if X API fails
      return { data: localResults, source: 'local' };
    }
  }

  // ---------------------------------------------------------------------------
  // X API — owned lists
  // ---------------------------------------------------------------------------

  async getOwnedXLists(userId: string): Promise<any> {
    try {
      const response = await this.xdkClient.readClient.users.getOwnedLists(
        userId,
        {
          listFields: [
            'id',
            'name',
            'description',
            'member_count',
            'owner_id',
            'private',
            'created_at',
          ],
          maxResults: 100,
        },
      );
      return { data: response?.data || [], meta: response?.meta };
    } catch (error) {
      // DIAGNOSTIC LOG: Capture full error details from X API
      this.logger.error(
        `Failed to fetch owned lists for user ${userId}: ${error?.message || error}`,
      );
      rethrowXdkError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // Import a list from X
  // ---------------------------------------------------------------------------

  async importXList(dto: ImportListDto) {
    const { xListId, name: overrideName } = dto;

    this.logger.log(`Importing X list ${xListId}...`);

    // 1. Fetch list metadata from X
    let listName = overrideName || `Imported list ${xListId}`;
    let listDescription = '';

    try {
      const listMeta = await this.xdkClient.readClient.lists.getById(xListId, {
        listFields: ['id', 'name', 'description'],
      });
      if (listMeta?.data) {
        listName = overrideName || listMeta.data.name || listName;
        listDescription = listMeta.data.description || '';
      }
    } catch (error) {
      this.logger.warn(
        `Could not fetch list metadata for ${xListId}: ${error?.message}`,
      );
    }

    // 2. Fetch all members (paginated)
    const allMembers: any[] = [];
    let paginationToken: string | undefined;

    try {
      do {
        const response = await this.xdkClient.readClient.lists.getMembers(
          xListId,
          {
            maxResults: 100,
            userFields: [
              'id',
              'name',
              'username',
              'description',
              'profile_image_url',
              'public_metrics',
              'verified',
            ],
            ...(paginationToken ? { paginationToken } : {}),
          },
        );

        console.log('\nresponse', response);

        const members = response?.data || [];
        allMembers.push(...members);

        paginationToken = response?.meta?.nextToken;
      } while (paginationToken);
    } catch (error) {
      this.logger.error(
        `Failed to fetch members for X list ${xListId}: ${error?.message || error}`,
      );
      rethrowXdkError(error);
    }

    this.logger.log(
      `Fetched ${allMembers.length} members from X list ${xListId}`,
    );

    // 3. Upsert each member as XUser and collect ObjectIds
    const memberObjectIds: Types.ObjectId[] = [];

    for (const member of allMembers) {
      try {
        const xUser = await this.xUserRepository.upsert({
          restId: member.id,
          username: member.username,
          displayName: member.name,
          bio: member.description || '',
          followers: member.publicMetrics?.followersCount || 0,
          following: member.publicMetrics?.followingCount || 0,
          verified: member.verified || false,
          profileImageUrl: member.profileImageUrl || '',
        });
        memberObjectIds.push((xUser as any)._id);
      } catch (error) {
        this.logger.warn(
          `Failed to upsert member @${member.username}: ${error?.message}`,
        );
      }
    }

    // 4. Create the local list
    const list = await this.listRepository.upsert({
      name: listName,
      description: listDescription,
      importedFromX: true,
      xListId,
      members: memberObjectIds,
    });

    this.logger.log(
      `Successfully imported X list ${xListId} as local list "${listName}" with ${memberObjectIds.length} members`,
    );

    return list;
  }
}
