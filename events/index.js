import { workforceEvents } from './workforce-events.js';
import { marketEvents } from './market-events.js';
import { metaEvents } from './meta-events.js';

export const allRandomEvents = [
  ...workforceEvents,
  ...marketEvents,
  ...metaEvents,
];

export const randomEventById = new Map(allRandomEvents.map((event) => [event.id, event]));

if (randomEventById.size !== 50) {
  throw new Error(`Expected 50 unique random events, got ${randomEventById.size}`);
}
