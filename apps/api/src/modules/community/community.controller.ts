import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator.js';
import { Roles } from '../../common/roles.decorator.js';
import { Permissions } from '../../common/permissions.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';
import { CommentWriteDto, CommunityPostListQueryDto, ModerationWriteDto, PostWriteDto,
  ReviewListQueryDto, ReviewWriteDto, MyOrderReviewsQueryDto, ModerationListQueryDto } from './community.dto.js';
import { CommunityPostService } from './community-post.service.js';
import { ModerationService } from './moderation.service.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('Reviews')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  list(@Query() query: ReviewListQueryDto) {
    return this.reviews.listPublic(query.productId, query.page ?? 1, query.limit ?? 20);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: AuthenticatedRequest, @Body() body: ReviewWriteDto) {
    return this.reviews.create(req.user.sub, body);
  }

  @Get('mine')
  mine(@Req() req: AuthenticatedRequest, @Query() query: MyOrderReviewsQueryDto) {
    if (query.orderId && !query.reviewIds) return this.reviews.listForOrder(req.user.sub, query.orderId);
    if (query.reviewIds && !query.orderId) return this.reviews.listOwned(req.user.sub, query.reviewIds);
    throw new BadRequestException('Provide either orderId or reviewIds');
  }

  @Patch(':reviewId')
  update(@Req() req: AuthenticatedRequest, @Param('reviewId') reviewId: string, @Body() body: ReviewWriteDto) {
    return this.reviews.update(req.user.sub, reviewId, body);
  }

  @Delete(':reviewId')
  @HttpCode(204)
  delete(@Req() req: AuthenticatedRequest, @Param('reviewId') reviewId: string) {
    return this.reviews.delete(req.user.sub, reviewId);
  }
}

@ApiTags('Community')
@Controller('community/posts')
export class CommunityController {
  constructor(private readonly community: CommunityPostService) {}

  @Public()
  @Get()
  list(@Query() query: CommunityPostListQueryDto) {
    return this.community.listPublic(query.q, query.page ?? 1, query.limit ?? 20);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Post()
  @HttpCode(201)
  create(@Req() req: AuthenticatedRequest, @Body() body: PostWriteDto) {
    return this.community.create(req.user.sub, body);
  }

  @Public()
  @Get(':postId')
  detail(@Param('postId') postId: string) {
    return this.community.getPublic(postId);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Patch(':postId')
  update(@Req() req: AuthenticatedRequest, @Param('postId') postId: string, @Body() body: PostWriteDto) {
    return this.community.update(req.user.sub, postId, body);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Delete(':postId')
  @HttpCode(204)
  delete(@Req() req: AuthenticatedRequest, @Param('postId') postId: string) {
    return this.community.delete(req.user.sub, postId);
  }

  @Public()
  @Get(':postId/comments')
  comments(@Param('postId') postId: string) {
    return this.community.listComments(postId);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Post(':postId/comments')
  @HttpCode(201)
  comment(@Req() req: AuthenticatedRequest, @Param('postId') postId: string, @Body() body: CommentWriteDto) {
    return this.community.createComment(req.user.sub, postId, body);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Patch(':postId/comments/:commentId')
  updateComment(
    @Req() req: AuthenticatedRequest,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Body() body: CommentWriteDto,
  ) {
    return this.community.updateComment(req.user.sub, postId, commentId, body);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Delete(':postId/comments/:commentId')
  @HttpCode(204)
  deleteComment(
    @Req() req: AuthenticatedRequest,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.community.deleteComment(req.user.sub, postId, commentId);
  }
}

@ApiTags('Moderation')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Permissions('content.moderate')
@Controller('admin/moderation')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  queue(@Query() query: ModerationListQueryDto) {
    return this.moderation.queue(query.page ?? 1, query.limit ?? 20, query.status, query.targetType);
  }

  @Patch(':targetId')
  moderate(@Req() req: AuthenticatedRequest, @Param('targetId') targetId: string, @Body() body: ModerationWriteDto) {
    return this.moderation.moderate(req.user.sub, targetId, body);
  }
}
