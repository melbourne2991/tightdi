const TokenType: unique symbol = Symbol("TokenType");
const TokenId: unique symbol = Symbol("TokenId");
const InternalResolve: unique symbol = Symbol("InternalResolve");
const InternalCheckInheriting: unique symbol = Symbol(
  "InternalCheckRegistrationsSubset"
);

interface BaseResolver<P extends InjectionToken<unknown>[]> {
  [InternalResolve]: <T extends P[number]>(
    token: T
  ) => T[typeof TokenType] | undefined;
  [InternalCheckInheriting]: (inheriting: ResolverRegistrations) => void;
}

export interface Resolver<P extends InjectionToken<unknown>[]>
  extends BaseResolver<P> {
  resolve: <T extends P[number]>(token: T) => T[typeof TokenType];
}

type ResolverRegistrations = ReadonlyMap<
  InjectionToken<unknown>,
  ServiceDefinition<any, unknown>
>;

class InternalResolver<P extends InjectionToken<unknown>[]>
  implements Resolver<P>
{
  private cache = new Map<P[number], unknown>();

  constructor(
    private readonly registrations: ResolverRegistrations,
    private readonly parent?: BaseResolver<InjectionToken<unknown>[]>
  ) {}

  [InternalCheckInheriting] = (inheriting: ResolverRegistrations) => {
    for (const key of this.registrations.keys()) {
      if (!inheriting.has(key)) {
        throw new Error(
          `Inheriting container is missing some of parent's registrations`
        );
      }
    }
  };

  [InternalResolve] = <T extends P[number]>(
    token: T
  ): T[typeof TokenType] | undefined => {
    const definition = this.registrations.get(token);

    if (!definition) {
      return undefined;
    }

    switch (definition.lifetime) {
      case "scoped": {
        const cached = this.cache.get(token);
        if (cached) {
          return cached;
        } else {
          const instance = definition.instance(
            ...definition.requires.map((token: InjectionToken<unknown>) =>
              this.resolve(token)
            )
          );
          this.cache.set(token, instance);
          return instance;
        }
      }

      case "singleton": {
        if (this.parent) {
          const resolution = this.parent[InternalResolve](token);

          if (resolution) {
            return resolution;
          }
        }

        const cached = this.cache.get(token);
        if (cached) {
          return cached;
        } else {
          const instance = definition.instance(
            ...definition.requires.map((token: InjectionToken<unknown>) =>
              this.resolve(token)
            )
          );
          this.cache.set(token, instance);
          return instance;
        }
      }

      case "transient": {
        if (this.parent) {
          const resolution = this.parent[InternalResolve](token);

          if (resolution) {
            return resolution;
          }
        }

        const instance = definition.instance(
          ...definition.requires.map((token: InjectionToken<unknown>) =>
            this.resolve(token)
          )
        );

        return instance;
      }
    }
  };

  resolve = <T extends P[number]>(token: T): T[typeof TokenType] => {
    const resolved = this[InternalResolve](token);

    if (!resolved) {
      throw new Error(`Missing registration for token`);
    }

    return resolved;
  };
}

export type InjectionTokenType<T extends InjectionToken<unknown>> =
  T[typeof TokenType];

export type InjectionTokenTypeArray<T extends InjectionToken<unknown>[]> = {
  [K in keyof T]: InjectionTokenType<T[K]>;
};

export interface ServiceFactory<O, T extends InjectionToken<unknown>[]> {
  (...context: InjectionTokenTypeArray<T>): O;
}

export class InjectionToken<T = unknown, K = unknown> {
  public readonly [TokenType]: T = undefined as T;
  public readonly [TokenId]: K = undefined as K;

  public readonly [Symbol.toStringTag]: string = "InjectionToken";

  private constructor(id: K) {
    this[TokenId] = id;
  }

  static of<T>(): InjectionToken<T, T>;
  static of<T, K>(id: K): InjectionToken<T, K>;
  static of<T, K>(id?: K) {
    if (!id) return new InjectionToken<T, unknown>(Symbol());
    return new InjectionToken<T, K>(id);
  }
}

interface ServiceDefinition<T extends InjectionToken<unknown>[], O> {
  requires: T;
  lifetime: "singleton" | "transient" | "scoped";
  instance: ServiceFactory<O, T>;
}

interface ServiceDefinitionBuilderA {
  requires<T extends InjectionToken<unknown>[]>(
    ...tokens: T
  ): ServiceDefinitionBuilderB<T>;
}
9;
interface ServiceDefinitionBuilderC<T extends InjectionToken<unknown>[], O> {
  singleton: () => ServiceDefinition<T, O>;
  transient: () => ServiceDefinition<T, O>;
  scoped: () => ServiceDefinition<T, O>;
}

interface ServiceDefinitionBuilderB<T extends InjectionToken<unknown>[]> {
  /**
   * Provide a factory function that creates an instance of the service.
   * Dependencies are injected by passing them as arguments to the factory function
   * in the same order as they were defined in the `requires` method.
   *
   * @param factory
   */
  from<O>(factory: ServiceFactory<O, T>): ServiceDefinitionBuilderC<T, O>;

  /**
   * Provide a class that can be instantiated to create an instance of the service.
   * Dependencies are injected by passing them as arguments to the constructor
   * in the same order as they were defined in the `requires` method.
   *
   * @param Class
   */
  fromClass<O>(
    Class: new (...args: InjectionTokenTypeArray<T>) => O
  ): ServiceDefinitionBuilderC<T, O>;

  /**
   * Provide a value representing the "service". 
   * This is not limited to objects, it can be any value.
   *
   * @param Class
   */
  fromValue<O>(
    value: O
  ): ServiceDefinition<T, O>;
}

const makeServiceDefinition = <O, T extends InjectionToken<unknown>[]>(
  tokens: T,
  lifetime: "singleton" | "transient" | "scoped",
  factory: ServiceFactory<O, T>
): ServiceDefinition<T, O> => {
  return {
    requires: tokens,
    lifetime,
    instance: factory,
  };
};

export const ServiceDefinition: ServiceDefinitionBuilderA = {
  requires: <T extends InjectionToken<unknown>[]>(...tokens: T) => {
    return {
      from: <O>(factory: ServiceFactory<O, T>) => {
        return {
          singleton: () => {
            return makeServiceDefinition<O, T>(tokens, "singleton", factory);
          },
          transient: () => {
            return makeServiceDefinition<O, T>(tokens, "transient", factory);
          },
          scoped: () => {
            return makeServiceDefinition<O, T>(tokens, "scoped", factory);
          },
        };
      },

      fromClass: <O>(Class: new (...args: InjectionTokenTypeArray<T>) => O) => {
        const factory: ServiceFactory<O, T> = (
          ...context: InjectionTokenTypeArray<T>
        ) => {
          return new Class(...context);
        };

        return {
          singleton: () => {
            return makeServiceDefinition<O, T>(tokens, "singleton", factory);
          },
          transient: () => {
            return makeServiceDefinition<O, T>(tokens, "transient", factory);
          },
          scoped: () => {
            return makeServiceDefinition<O, T>(tokens, "scoped", factory);
          },
        };
      },

      fromValue: <O>(value: O) => {
        const factory: ServiceFactory<O, T> = (
          ...context: InjectionTokenTypeArray<T>
        ) => {
          return value;
        };

        return makeServiceDefinition<O, T>(tokens, "singleton", factory);
      },
    };
  },
};

type Exact<A extends any, B extends any> = A extends B
  ? B extends A
    ? A
    : never
  : never;
  
type ExcludeExact<T extends any, U extends any> = T extends any
  ? Exact<T, U> extends never
    ? T
    : never
  : never;

type RemainingTokens<
  R extends InjectionToken<unknown>,
  P extends InjectionToken<unknown>
> = ExcludeExact<R, P>;

type ExtractFromService<T extends ServiceDefinition<any, any>> =
  T extends ServiceDefinition<infer R, any> ? R : never;

const ContainerRequiredKey: unique symbol = Symbol("ContainerRequiredKey");
const ContainerProvidedKey: unique symbol = Symbol("ContainerProvidedKey");
const ContainerMapKey: unique symbol = Symbol("ContainerMapKey");
interface ContainerInternal<
  R extends InjectionToken<unknown>[],
  P extends InjectionToken<unknown>[]
> {
  readonly [ContainerRequiredKey]: R;
  readonly [ContainerProvidedKey]: P;
  readonly [ContainerMapKey]: Map<P[number], ServiceDefinition<any, any>>;
}

type FilterNotAlreadyProvided<
  T extends InjectionToken<unknown>,
  P extends InjectionToken<unknown>[]
> = T extends P[number] ? never : T;

// Enforces that T is a subset of U (that is, the child resolver can resolve all the tokens that the parent can resolve)
type MaybeParentResolver<
  T extends InjectionToken<unknown>[],
  U extends InjectionToken<unknown>[]
> = [T[number]] extends [U[number]] ? Resolver<T> | BaseResolver<T> : never;

interface PartialContainer<
  R extends InjectionToken<unknown>[],
  P extends InjectionToken<unknown>[]
> extends ContainerInternal<R, P> {
  provide: <
    T extends InjectionToken<unknown>,
    V extends ServiceDefinition<any, T[typeof TokenType]>
  >(
    token: FilterNotAlreadyProvided<T, P>,
    value: V
  ) => Container<[...R, ...ExtractFromService<V>], [...P, T]>;

  resolver(): BaseResolver<P>;
}

interface CompleteContainer<
  R extends InjectionToken<unknown>[],
  P extends InjectionToken<unknown>[]
> extends ContainerInternal<R, P> {
  readonly [ContainerRequiredKey]: R;
  readonly [ContainerProvidedKey]: P;
  readonly [ContainerMapKey]: Map<P[number], ServiceDefinition<any, any>>;

  provide: <
    T extends InjectionToken<unknown>,
    V extends ServiceDefinition<any, T[typeof TokenType]>
  >(
    token: FilterNotAlreadyProvided<T, P>,
    value: V
  ) => Container<[...R, ...ExtractFromService<V>], [...P, T]>;

  resolver<G extends InjectionToken<unknown>[]>(
    parent: MaybeParentResolver<G, P>
  ): Resolver<P>;

  resolver(): Resolver<P>;
}

type Container<
  R extends InjectionToken<unknown>[],
  P extends InjectionToken<unknown>[]
> = RemainingTokens<R[number], P[number]> extends never
  ? CompleteContainer<R, P>
  : PartialContainer<R, P>;

interface EmptyContainer {
  provide: <
    T extends InjectionToken<unknown>,
    V extends ServiceDefinition<any, T[typeof TokenType]>
  >(
    token: T,
    value: V
  ) => Container<ExtractFromService<V>, [T]>;
}

function createInnerContainer<
  R extends InjectionToken<unknown>[],
  P extends InjectionToken<unknown>[]
>(
  required: R,
  provided: P,
  map: Map<P[number], ServiceDefinition<any, any>>
): Container<R, P> {
  const container: CompleteContainer<R, P> = {
    [ContainerRequiredKey]: required,
    [ContainerProvidedKey]: provided,
    [ContainerMapKey]: map,

    provide: <
      T extends InjectionToken<unknown>,
      V extends ServiceDefinition<any, T[typeof TokenType]>
    >(
      token: FilterNotAlreadyProvided<T, P>,
      value: V
    ) => {
      const nextRequired: [...R, ...ExtractFromService<V>] = [
        ...required,
        ...(value.requires as ExtractFromService<V>),
      ];
      const nextProvided: [...P, T] = [...provided, token];
      const nextMap = new Map(map);

      nextMap.set(token, value);

      return createInnerContainer(nextRequired, nextProvided, nextMap as any);
    },

    resolver: <G extends InjectionToken<unknown>[]>(
      parent?: MaybeParentResolver<G, P>
    ) => {
      if (parent) {
        parent[InternalCheckInheriting](map);
      }

      checkForCycles(map);

      return new InternalResolver(map, parent);
    },
  };

  return container as Container<R, P>;
}

export function createContainer(): EmptyContainer {
  return {
    provide: <
      T extends InjectionToken<unknown>,
      V extends ServiceDefinition<any, T[typeof TokenType]>
    >(
      token: T,
      value: V
    ): Container<ExtractFromService<V>, [T]> => {
      const required = value.requires;
      const provided: [T] = [token];

      const map = new Map();
      map.set(token, value);

      return createInnerContainer(required, provided, map);
    },
  };
}

/**
 * === Cycle Detection ===
 */

type Graph = Map<InjectionToken<unknown>, InjectionToken<unknown>[]>;

export class CyclicDependencyError extends Error {}

function checkForCycles(
  map: Map<InjectionToken<unknown>, ServiceDefinition<InjectionToken[], unknown>>
) {
  const graph = graphFromServiceMap(map);

  if (isCyclic(graph)) {
    throw new CyclicDependencyError("Circular dependency detected");
  }
}

function graphFromServiceMap(
  map: Map<InjectionToken<unknown>, ServiceDefinition<InjectionToken[], unknown>>
): Graph {
  const graph = new Map<InjectionToken<unknown>, InjectionToken<unknown>[]>();

  for (const [key, value] of map.entries()) {
    graph.set(key, value.requires);
  }

  return graph;
}

function hasCycle(
  graph: Graph,
  node: InjectionToken<unknown>,
  visited: Set<InjectionToken<unknown>>,
  recStack: Set<InjectionToken<unknown>>
): boolean {
  if (recStack.has(node)) return true;
  if (visited.has(node)) return false;

  visited.add(node);
  recStack.add(node);

  for (const neighbor of graph.get(node) ?? []) {
    if (hasCycle(graph, neighbor, visited, recStack)) return true;
  }

  recStack.delete(node);

  return false;
}

function isCyclic(graph: Graph): boolean {
  const visited = new Set<InjectionToken<unknown>>();
  const recStack = new Set<InjectionToken<unknown>>();

  for (const [node] of graph.entries()) {
    if (hasCycle(graph, node, visited, recStack)) return true;
  }

  return false;
}
