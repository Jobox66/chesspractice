// FSRS scheduling, same parameters as the web app (frontend/src/util/srs.ts)
// so a card reviewed on the phone and one reviewed in the browser follow
// one schedule. ts-fsrs is pinned to the web app's version for that reason.
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs';

export type { Card };

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: true,
    enable_short_term: false,
  }),
);

export const createCard = (): Card => createEmptyCard();

// correct -> Rating.Good, incorrect -> Rating.Again
export function reviewCard(card: Card, correct: boolean, now = new Date()): Card {
  // The backend's card struct has no learning_steps, so cards that went
  // through the server come back without it.
  const input = { ...card, learning_steps: card.learning_steps ?? 0 };
  return scheduler.next(input, now, correct ? Rating.Good : Rating.Again).card;
}

export const dueAt = (card: Card) => new Date(card.due).getTime();
