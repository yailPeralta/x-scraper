import { Controller, Get, Param, Query, Sse, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { TrackerEvent } from '../interfaces/tracker-event.interface';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

/**
 * SSE (Server-Sent Events) gateway for pushing real-time tracker events to clients.
 * Uses NestJS @Sse decorator for native SSE support.
 */
@Controller('trackers/sse')
export class TrackerEventsGateway {
  private readonly logger = new Logger(TrackerEventsGateway.name);
  private readonly eventSubject = new Subject<TrackerEvent>();

  /**
   * Listen for all tracker events emitted via EventEmitter2.
   */
  @OnEvent('tracker.event')
  handleTrackerEvent(event: any): void {
    this.eventSubject.next(event as TrackerEvent);
  }

  /**
   * GET /trackers/events/stream — SSE endpoint for ALL tracker events
   */
  @Sse('events/stream')
  streamAllEvents(): Observable<MessageEvent> {
    this.logger.log('Client connected to all-events SSE stream');

    return this.eventSubject.asObservable().pipe(
      map((event) => ({
        data: JSON.stringify(event),
        type: event.eventType,
        id: `${event.trackerId}-${Date.now()}`,
      })),
    );
  }

  /**
   * GET /trackers/:id/events/stream — SSE endpoint for a specific tracker's events
   */
  @Sse(':id/events/stream')
  streamTrackerEvents(
    @Param('id') trackerId: string,
  ): Observable<MessageEvent> {
    this.logger.log(`Client connected to SSE stream for tracker: ${trackerId}`);

    return this.eventSubject.asObservable().pipe(
      filter((event) => event.trackerId === trackerId),
      map((event) => ({
        data: JSON.stringify(event),
        type: event.eventType,
        id: `${event.trackerId}-${Date.now()}`,
      })),
    );
  }

  /**
   * GET /trackers/events/stream/type/:type — SSE endpoint filtered by tracker type
   */
  @Sse('events/stream/type/:type')
  streamEventsByType(
    @Param('type') trackerType: string,
  ): Observable<MessageEvent> {
    this.logger.log(
      `Client connected to SSE stream for tracker type: ${trackerType}`,
    );

    return this.eventSubject.asObservable().pipe(
      filter((event) => event.trackerType === trackerType),
      map((event) => ({
        data: JSON.stringify(event),
        type: event.eventType,
        id: `${event.trackerId}-${Date.now()}`,
      })),
    );
  }
}
