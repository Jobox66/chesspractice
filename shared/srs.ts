// FSRS scheduling for openings, puzzles and mistakes on web and mobile alike,
// so a card reviewed on the phone and one reviewed in the browser follow one
// schedule.
import {
  Card,
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type FSRSParameters,
  type FSRS,
} from 'ts-fsrs';

export type { Card, FSRSParameters };
export { Rating, State } from 'ts-fsrs';

export type SrsConfig = Pick<
  FSRSParameters,
  'request_retention' | 'maximum_interval' | 'enable_fuzz' | 'enable_short_term'
>;

export const defaultSrsConfig: SrsConfig = {
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: false,
};

let _scheduler: FSRS = fsrs(generatorParameters(defaultSrsConfig));

export function getScheduler(): FSRS {
  return _scheduler;
}

export function updateScheduler(config: SrsConfig): void {
  _scheduler = fsrs(generatorParameters(config));
}

export function createCard(): Card {
  return createEmptyCard();
}

/**
 * Review a card. `correct` maps to Rating.Good, incorrect to Rating.Again.
 * Returns the updated card.
 */
export function reviewCard(card: Card, correct: boolean, now = new Date()): Card {
  // The backend's card struct has no learning_steps, so cards that went
  // through the server come back without it.
  const input = { ...card, learning_steps: card.learning_steps ?? 0 };
  return getScheduler().next(input, now, correct ? Rating.Good : Rating.Again).card;
}

export const dueAt = (card: Card) => new Date(card.due).getTime();
