import { TrackerType } from './tracker-type.enum';

export interface TrackerEvent {
  trackerId: string;
  trackerType: TrackerType;
  eventType: string; // e.g. 'new_tweet', 'profile_change', 'follower_change', etc.
  data: any;
  timestamp: Date;
}
