/**
 * A model of how the request transaction reaches the repository, under three ways of sharing
 * it. It counts objects; it does not measure a heap.
 *
 * The provider graph is the surveys path of apps/api (a test pins it to the real
 * constructors). `scopesFor` mirrors Nest's `isDependencyTreeStatic` in
 * references/nest/packages/core/injector/instance-wrapper.ts: a provider is request-scoped if
 * it is declared `Scope.REQUEST` or if anything it depends on is. A request-scoped provider
 * gets one instance per request (`getInstanceByContextId`), shared by every consumer in that
 * request; one instance per consumer is `Scope.TRANSIENT`, which no strategy here uses.
 */

export type Strategy = 'argument' | 'request-scoped' | 'als';

export const STRATEGIES: readonly {
  id: Strategy;
  label: string;
  hint: string;
}[] = [
  {
    id: 'argument',
    label: 'Pass it as an argument (this app)',
    hint: '@CurrentTx() reads request.tx; every repository method takes tx: TenantTx.',
  },
  {
    id: 'request-scoped',
    label: 'Inject a request-scoped provider',
    hint: 'A Scope.REQUEST TxHolder that the interceptor fills and the repository injects. It must be a holder: Nest builds it before the guards run, when request.tx does not exist yet.',
  },
  {
    id: 'als',
    label: 'Carry it in AsyncLocalStorage',
    hint: 'The interceptor runs the handler inside als.run({ tx }); the repository reads the store from a singleton TxStorage.',
  },
];

export interface ProviderNode {
  name: string;
  /** Declared `Scope.REQUEST` itself, rather than made request-scoped by a dependency. */
  declaredRequest: boolean;
  deps: readonly string[];
}

/** The surveys path, with the one extra provider each strategy needs. */
export function graphFor(strategy: Strategy): readonly ProviderNode[] {
  const repositoryDeps =
    strategy === 'request-scoped'
      ? ['TxHolder']
      : strategy === 'als'
        ? ['TxStorage']
        : [];
  const nodes: ProviderNode[] = [
    {
      name: 'SurveysController',
      declaredRequest: false,
      deps: ['SurveysService', 'SummaryService'],
    },
    {
      name: 'SurveysService',
      declaredRequest: false,
      deps: ['SurveysRepository'],
    },
    {
      name: 'SummaryService',
      declaredRequest: false,
      deps: ['SurveysRepository'],
    },
    { name: 'SurveysRepository', declaredRequest: false, deps: repositoryDeps },
  ];
  if (strategy === 'request-scoped') {
    nodes.push({ name: 'TxHolder', declaredRequest: true, deps: [] });
  }
  if (strategy === 'als') {
    nodes.push({ name: 'TxStorage', declaredRequest: false, deps: [] });
  }
  return nodes;
}

export type Scope = 'singleton' | 'per-request';

/** Nest's rule: request scope bubbles up to everything that depends on it. */
export function scopesFor(
  nodes: readonly ProviderNode[],
): ReadonlyMap<string, Scope> {
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const memo = new Map<string, Scope>();
  const visit = (name: string): Scope => {
    const known = memo.get(name);
    if (known) return known;
    const node = byName.get(name);
    if (!node) throw new Error(`Unknown provider ${name}`);
    const scope: Scope =
      node.declaredRequest ||
      node.deps.some((dep) => visit(dep) === 'per-request')
        ? 'per-request'
        : 'singleton';
    memo.set(name, scope);
    return scope;
  };
  for (const node of nodes) visit(node.name);
  return memo;
}

/** pg-pool's default `max`; db.module.ts does not change it. */
export const POOL_MAX = 10;

export interface Tally {
  /** Nest instances built at startup and kept for the life of the process. */
  singletons: number;
  /** Nest instances built for each request and thrown away after it. */
  builtPerRequest: number;
  /** Extra per-request objects that are not Nest instances (the ALS store). */
  extraPerRequest: number;
  /**
   * Nest instances alive with `inFlight` requests. A queued request counts too: Nest builds a
   * request's instances (`loadPerContext` in router-explorer.ts) before its guards run, so
   * before the interceptor waits for a connection.
   */
  liveInstances: number;
  /** Instances built and discarded over 1,000 requests. */
  garbagePer1000: number;
  /** Connections borrowed from the pool, and requests queued for one. */
  borrowed: number;
  waiting: number;
}

export function tally(strategy: Strategy, inFlight: number): Tally {
  const scopes = [...scopesFor(graphFor(strategy)).values()];
  const singletons = scopes.filter((scope) => scope === 'singleton').length;
  const builtPerRequest = scopes.length - singletons;
  const extraPerRequest = strategy === 'als' ? 1 : 0;
  // Every strategy holds one connection for the life of each request transaction.
  const borrowed = Math.min(inFlight, POOL_MAX);
  return {
    singletons,
    builtPerRequest,
    extraPerRequest,
    liveInstances: singletons + builtPerRequest * inFlight,
    garbagePer1000: (builtPerRequest + extraPerRequest) * 1000,
    borrowed,
    waiting: inFlight - borrowed,
  };
}

export type Org = 'Acme' | 'Blue River';

export interface Slot {
  index: number;
  /** The organisation of the request holding this connection, or null when idle. */
  holder: Org | null;
  /** The organisation still set on an idle connection. Only with is_local = false. */
  leftover: Org | null;
}

/**
 * The pool after a busy spell that used every connection, with `inFlight` requests now
 * running. Requests alternate Acme and Blue River. Idle connections are clean when the
 * settings are transaction-local, and keep the last caller's organisation when they are not.
 */
export function poolSlots(inFlight: number, isLocal: boolean): Slot[] {
  const orgOf = (n: number): Org => (n % 2 === 0 ? 'Acme' : 'Blue River');
  return Array.from({ length: POOL_MAX }, (_, index) => {
    const busy = index < Math.min(inFlight, POOL_MAX);
    return {
      index,
      holder: busy ? orgOf(index) : null,
      // The earlier spell ran one request per connection, offset by one, so the leftover
      // organisation differs from the one a new request would bring.
      leftover: !busy && !isLocal ? orgOf(index + 1) : null,
    };
  });
}

/** What happens when code forgets the transaction, per strategy. */
export const FORGET: Readonly<Record<Strategy, string>> = {
  argument:
    'A compile error. A repository method without tx: TenantTx does not type check, and Db is not a TenantTx.',
  'request-scoped':
    'Cannot forget: the repository gets TxHolder by injection, though it is empty until the interceptor fills it. The cost is that every class above it is rebuilt for each request.',
  als: 'A runtime problem. Code outside als.run() reads undefined, so every read must check and throw. A fallback such as store?.tx ?? db type checks and runs outside the tenant settings.',
};
