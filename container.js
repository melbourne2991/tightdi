// container.ts
var TokenType = Symbol("TokenType");
var TokenId = Symbol("TokenId");
var InternalResolve = Symbol("InternalResolve");
var InternalCheckInheriting = Symbol(
  "InternalCheckRegistrationsSubset"
);
var InternalResolver = class {
  constructor(registrations, parent) {
    this.registrations = registrations;
    this.parent = parent;
  }
  cache = /* @__PURE__ */ new Map();
  [InternalCheckInheriting] = (inheriting) => {
    for (const key of this.registrations.keys()) {
      if (!inheriting.has(key)) {
        throw new Error(
          `Inheriting container is missing some of parent's registrations`
        );
      }
    }
  };
  [InternalResolve] = (token) => {
    const definition = this.registrations.get(token);
    if (!definition) {
      return void 0;
    }
    switch (definition.lifetime) {
      case "scoped": {
        const cached = this.cache.get(token);
        if (cached) {
          return cached;
        } else {
          const instance = definition.instance(
            ...definition.requires.map(
              (token2) => this.resolve(token2)
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
            ...definition.requires.map(
              (token2) => this.resolve(token2)
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
          ...definition.requires.map(
            (token2) => this.resolve(token2)
          )
        );
        return instance;
      }
    }
  };
  resolve = (token) => {
    const resolved = this[InternalResolve](token);
    if (!resolved) {
      throw new Error(`Missing registration for token`);
    }
    return resolved;
  };
};
var InjectionToken = class _InjectionToken {
  [TokenType] = void 0;
  [TokenId] = void 0;
  [Symbol.toStringTag] = "InjectionToken";
  constructor(id) {
    this[TokenId] = id;
  }
  static of(id) {
    if (!id)
      return new _InjectionToken(Symbol());
    return new _InjectionToken(id);
  }
};
var makeServiceDefinition = (tokens, lifetime, factory) => {
  return {
    requires: tokens,
    lifetime,
    instance: factory
  };
};
var ServiceDefinition = {
  requires: (...tokens) => {
    return {
      from: (factory) => {
        return {
          singleton: () => {
            return makeServiceDefinition(tokens, "singleton", factory);
          },
          transient: () => {
            return makeServiceDefinition(tokens, "transient", factory);
          },
          scoped: () => {
            return makeServiceDefinition(tokens, "scoped", factory);
          }
        };
      },
      fromClass: (Class) => {
        const factory = (...context) => {
          return new Class(...context);
        };
        return {
          singleton: () => {
            return makeServiceDefinition(tokens, "singleton", factory);
          },
          transient: () => {
            return makeServiceDefinition(tokens, "transient", factory);
          },
          scoped: () => {
            return makeServiceDefinition(tokens, "scoped", factory);
          }
        };
      },
      fromValue: (value) => {
        const factory = (...context) => {
          return value;
        };
        return makeServiceDefinition(tokens, "singleton", factory);
      }
    };
  }
};
var ContainerRequiredKey = Symbol("ContainerRequiredKey");
var ContainerProvidedKey = Symbol("ContainerProvidedKey");
var ContainerMapKey = Symbol("ContainerMapKey");
function createInnerContainer(required, provided, map) {
  const container = {
    [ContainerRequiredKey]: required,
    [ContainerProvidedKey]: provided,
    [ContainerMapKey]: map,
    provide: (token, value) => {
      const nextRequired = [
        ...required,
        ...value.requires
      ];
      const nextProvided = [...provided, token];
      const nextMap = new Map(map);
      nextMap.set(token, value);
      return createInnerContainer(nextRequired, nextProvided, nextMap);
    },
    resolver: (parent) => {
      if (parent) {
        parent[InternalCheckInheriting](map);
      }
      checkForCycles(map);
      return new InternalResolver(map, parent);
    }
  };
  return container;
}
function createContainer() {
  return {
    provide: (token, value) => {
      const required = value.requires;
      const provided = [token];
      const map = /* @__PURE__ */ new Map();
      map.set(token, value);
      return createInnerContainer(required, provided, map);
    }
  };
}
var CyclicDependencyError = class extends Error {
};
function checkForCycles(map) {
  const graph = graphFromServiceMap(map);
  if (isCyclic(graph)) {
    throw new CyclicDependencyError("Circular dependency detected");
  }
}
function graphFromServiceMap(map) {
  const graph = /* @__PURE__ */ new Map();
  for (const [key, value] of map.entries()) {
    graph.set(key, value.requires);
  }
  return graph;
}
function hasCycle(graph, node, visited, recStack) {
  if (recStack.has(node))
    return true;
  if (visited.has(node))
    return false;
  visited.add(node);
  recStack.add(node);
  for (const neighbor of graph.get(node) ?? []) {
    if (hasCycle(graph, neighbor, visited, recStack))
      return true;
  }
  recStack.delete(node);
  return false;
}
function isCyclic(graph) {
  const visited = /* @__PURE__ */ new Set();
  const recStack = /* @__PURE__ */ new Set();
  for (const [node] of graph.entries()) {
    if (hasCycle(graph, node, visited, recStack))
      return true;
  }
  return false;
}
export {
  CyclicDependencyError,
  InjectionToken,
  ServiceDefinition,
  createContainer
};
