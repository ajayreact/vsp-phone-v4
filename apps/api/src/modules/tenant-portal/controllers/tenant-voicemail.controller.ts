import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import {
  BulkVoicemailMessageIdsDto,
  CreateVoicemailDto,
  SearchVoicemailMessagesDto,
  UpdateVoicemailDto,
  UpdateVoicemailMessageDto,
  UpsertVoicemailGreetingDto,
} from '../dto/tenant-voicemail.dto';
import { TenantVoicemailService } from '../services/tenant-voicemail.service';

@ApiTags('tenant-voicemail')
@ApiBearerAuth()
@Controller('v1/tenant/voicemail')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantVoicemailController {
  constructor(private readonly voicemail: TenantVoicemailService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_READ)
  async list(@Req() req: Request, @Query('search') search?: string) {
    const user = getJwtUser(req);
    const data = await this.voicemail.list(user.tenantId, search);
    return { data };
  }

  @Get('reports')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_READ)
  reports(@Req() req: Request, @Query('days') days?: string) {
    const user = getJwtUser(req);
    return this.voicemail.getReports(user.tenantId, days ? Number(days) : 30);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  create(@Body() dto: CreateVoicemailDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.create(user.tenantId, user.sub, dto);
  }

  @Post('messages/bulk-delete')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  bulkDeleteMessages(@Body() dto: BulkVoicemailMessageIdsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.bulkDeleteMessages(user.tenantId, user.sub, dto);
  }

  @Post('messages/bulk-read')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  bulkMarkRead(@Body() dto: BulkVoicemailMessageIdsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.bulkMarkRead(user.tenantId, user.sub, dto, true);
  }

  @Post('messages/bulk-unread')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  bulkMarkUnread(@Body() dto: BulkVoicemailMessageIdsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.bulkMarkRead(user.tenantId, user.sub, dto, false);
  }

  @Patch('messages/:messageId')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  updateMessage(@Param('messageId') messageId: string, @Body() dto: UpdateVoicemailMessageDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.updateMessage(user.tenantId, user.sub, messageId, dto);
  }

  @Post('messages/:messageId/restore')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  restoreMessage(@Param('messageId') messageId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.restoreMessage(user.tenantId, user.sub, messageId);
  }

  @Delete('messages/:messageId')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  deleteMessage(@Param('messageId') messageId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.deleteMessage(user.tenantId, user.sub, messageId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_READ)
  getById(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.getById(user.tenantId, id);
  }

  @Get(':id/messages')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_READ)
  listMessages(
    @Param('id') id: string,
    @Query() query: SearchVoicemailMessagesDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.voicemail.listMessages(user.tenantId, id, query);
  }

  @Get(':id/messages/:messageId/playback')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_READ)
  playback(@Param('messageId') messageId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.getMessagePlaybackUrl(user.tenantId, messageId);
  }

  @Post(':id/greetings')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  upsertGreeting(@Param('id') id: string, @Body() dto: UpsertVoicemailGreetingDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.upsertGreeting(user.tenantId, user.sub, id, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateVoicemailDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE, PERMISSIONS.TENANT_ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.remove(user.tenantId, user.sub, id);
  }
}
