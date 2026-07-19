import { workforceEvents } from './workforce-events.js';
import { marketEvents } from './market-events.js';
import { metaEvents } from './meta-events.js';
import { goodNewsEvents } from './good-news-events.js';

export const allRandomEvents = [
  ...workforceEvents,
  ...marketEvents,
  ...metaEvents,
  ...goodNewsEvents,
];

export const randomEventById = new Map(allRandomEvents.map((event) => [event.id, event]));

if (randomEventById.size < 54) {
  throw new Error(`Expected at least 54 unique random events, got ${randomEventById.size}`);
}
