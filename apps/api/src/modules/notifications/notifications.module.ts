import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WhatsAppService } from './whatsapp.service';

/**
 * Global so any domain module can inject `NotificationsService` without
 * adding it to their imports list.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [EmailService, WhatsAppService, NotificationsService],
  exports: [EmailService, WhatsAppService, NotificationsService],
})
export class NotificationsModule {}
