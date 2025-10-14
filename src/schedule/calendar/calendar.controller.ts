import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { CalendarService } from './calendar.service';

@Controller('patients/:id/calendar')
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  // POST /patients/{id}/calendar/events
  @Post('events')
  createEvent(
    @Param('id') profileId: string,
    @Body()
    body: {
      appointment_name: string;
      appointment_date: string;
      appointment_time: string;
      local?: string;
      observation?: string;
    },
  ) {
    return this.service.createEvent(profileId, body);
  }

  // GET /patients/{id}/calendar/events
  @Get('events')
  listEvents(@Param('id') profileId: string) {
    return this.service.listEvents(profileId);
  }

  // GET /patients/{id}/calendar/summary
  @Get('summary')
  getSummary(@Param('id') profileId: string) {
    return this.service.getMonthlySummary(profileId);
  }
}
