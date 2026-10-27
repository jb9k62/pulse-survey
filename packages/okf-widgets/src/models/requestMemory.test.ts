import { describe, expect, it } from 'vitest';
import controllerSource from '@api/surveys/surveys.controller.ts?raw';
import repositorySource from '@api/surveys/surveys.repository.ts?raw';
import summarySource from '@api/surveys/summary.service.ts?raw';
import serviceSource from '@api/surveys/surveys.service.ts?raw';
import { graphFor, poolSlots, scopesFor, tally } from './requestMemory.ts';

/** The class names a constructor takes, read from the real source. */
function constructorDeps(source: string): string[] {
  const match = /constructor\(([\s\S]*?)\)\s*\{/.exec(source);
  if (!match) return [];
  return [...match[1]!.matchAll(/:\s*(\w+)/g)].map((found) => found[1]!);
}

describe('the provider graph', () => {
  it('matches the constructors in apps/api for the app as built', () => {
    const graph = new Map(
      graphFor('argument').map((node) => [node.name, [...node.deps]]),
    );
    expect(constructorDeps(controllerSource)).toEqual(
      graph.get('SurveysController'),
    );
    expect(constructorDeps(serviceSource)).toEqual(graph.get('SurveysService'));
    expect(constructorDeps(summarySource)).toEqual(graph.get('SummaryService'));
    expect(constructorDeps(repositorySource)).toEqual(
      graph.get('SurveysRepository'),
    );
  });

  it('keeps every provider a singleton when the transaction is an argument', () => {
    const scopes = [...scopesFor(graphFor('argument')).values()];
    expect(scopes.every((scope) => scope === 'singleton')).toBe(true);
  });

  it('bubbles request scope up to the controller, as isDependencyTreeStatic does', () => {
    const scopes = scopesFor(graphFor('request-scoped'));
    expect(Object.fromEntries(scopes)).toEqual({
      TxHolder: 'per-request',
      SurveysRepository: 'per-request',
      SurveysService: 'per-request',
      SummaryService: 'per-request',
      SurveysController: 'per-request',
    });
  });
});

describe('the tally', () => {
  it('builds nothing per request for the argument and five for request scope', () => {
    expect(tally('argument', 60)).toMatchObject({
      singletons: 4,
      builtPerRequest: 0,
      liveInstances: 4,
      garbagePer1000: 0,
      borrowed: 10,
      waiting: 50,
    });
    expect(tally('request-scoped', 60)).toMatchObject({
      singletons: 0,
      builtPerRequest: 5,
      liveInstances: 300,
      garbagePer1000: 5000,
    });
    expect(tally('als', 60)).toMatchObject({
      singletons: 5,
      builtPerRequest: 0,
      extraPerRequest: 1,
      garbagePer1000: 1000,
    });
  });
});

describe('the pool', () => {
  it('leaves idle connections clean only when the settings are transaction-local', () => {
    expect(poolSlots(3, true).filter((slot) => slot.leftover)).toHaveLength(0);
    const stale = poolSlots(3, false).filter((slot) => slot.leftover);
    expect(stale).toHaveLength(7);
    expect(poolSlots(12, false).some((slot) => slot.leftover)).toBe(false);
  });
});
