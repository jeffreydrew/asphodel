import { Significance } from '../types';
import type { ActionResult } from '../types';
import type { Soul } from '../soul/Soul';
import { ghostPublisher } from './GhostPublisher';
import { twitterClient } from './TwitterClient';
import { redditClient } from './RedditClient';
import { worldAccount } from './WorldAccount';

export class IntegrationDispatcher {
  async dispatch(
    soul: Soul,
    actionType: string,
    significance: Significance,
    generatedText: string | undefined,
    result: ActionResult,
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    // Ghost: publish content when soul creates something with LLM text
    if (
      /create_content|write_book|publish/.test(actionType) &&
      generatedText &&
      ghostPublisher.isConfigured()
    ) {
      const lines = generatedText.split('\n\n');
      const title = lines[0]?.substring(0, 100) ?? 'Untitled';
      const body  = lines.slice(1).join('\n\n') || generatedText;
      tasks.push(ghostPublisher.publish(soul.id, soul.identity, title, body));
    }

    // Twitter: post when social action has generated text
    if (
      /social_post|tweet|post/.test(actionType) &&
      generatedText &&
      twitterClient.isConfigured(soul.identity.full_name)
    ) {
      tasks.push(twitterClient.tweet(soul.id, soul.identity, generatedText));
    }

    // Reddit: post when social action has generated text (alternates with Twitter)
    if (
      /social_post|tweet|post/.test(actionType) &&
      generatedText &&
      redditClient.isConfigured(soul.identity.full_name)
    ) {
      const { tick } = soul;
      if (tick % 2 === 0) {
        tasks.push(redditClient.post(soul.id, soul.identity, generatedText));
      }
    }

    // @asphodel_tower: announce SIGNIFICANT events
    if (significance === Significance.SIGNIFICANT && worldAccount.isConfigured()) {
      tasks.push(
        worldAccount.announceEvent(significance, result.description, soul.name),
      );
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }
}

export const integrationDispatcher = new IntegrationDispatcher();
