import {
  CyclicDependencyError,
  InjectionToken,
  ServiceDefinition,
  createContainer,
} from "./container.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.195.0/assert/mod.ts";
import { describe, it } from "https://deno.land/std@0.195.0/testing/bdd.ts";


interface TestServiceA {
  first: (value: number) => number;
}

interface TestServiceB {
  second: (value: number) => number;
}

interface TestServiceC {
  third: (value: number) => number;
}

interface TestServiceD {
  fourth: (value: number) => number;
}

const noopA = {
  first: (value: number) => value,
};

const noopB = {
  second: (value: number) => value,
};

const noopC = {
  third: (value: number) => value,
};

const noopD = {
  fourth: (value: number) => value,
};

describe("Container", () => {
  it("typcheck - provide does not allow incompatible types", () => {
    const depA = InjectionToken.of<TestServiceA>();

    const serviceInstance = {
      second: (value: number) => value,
    };

    const serviceDefinition = ServiceDefinition.requires()
      .from(() => serviceInstance)
      .singleton();

    const container = createContainer();

    // @ts-expect-error: service definition should not be allowed as it does not match the type of depA
    container.provide(depA, serviceDefinition);
  });

  it("typcheck - factory parameters are inferred", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();

    ServiceDefinition.requires(depA, depB)
      .from((a, b) => {
        a.first;
        b.second;
      })
      .singleton();
  });

  it("typecheck - does not allow the same type to be provided twice", () => {
    const depA = InjectionToken.of<TestServiceA>(); // Same type as depB
    const depB = InjectionToken.of<TestServiceA>(); // Same type as depA
    const depC = InjectionToken.of<TestServiceB>();

    const serviceAInstance = {
      first: (value: number) => value,
    };

    const serviceBInstance = {
      second: (value: number) => value,
    };

    const serviceADefinition = ServiceDefinition.requires(depB)
      .from<TestServiceA>(() => serviceAInstance)
      .singleton();

    const serviceBDefinition = ServiceDefinition.requires()
      .from<TestServiceB>(() => serviceBInstance)
      .singleton();

    const container = createContainer();

    container
      .provide(depA, serviceADefinition)
      // @ts-expect-error: depB is already provided
      .provide(depB, serviceADefinition)
      .provide(depC, serviceBDefinition);
  });

  it("typecheck - does allow the same type to be provided twice when qualified", () => {
    const depA = InjectionToken.of<TestServiceA>(); // Same type as depB
    const depB = InjectionToken.of<TestServiceA, "v2">("v2"); // qualified
    const depC = InjectionToken.of<TestServiceB>();

    const serviceAInstance = {
      first: (value: number) => value,
    };

    const serviceBInstance = {
      second: (value: number) => value,
    };

    const serviceADefinition = ServiceDefinition.requires(depB)
      .from<TestServiceA>(() => serviceAInstance)
      .singleton();

    const serviceBDefinition = ServiceDefinition.requires()
      .from<TestServiceB>(() => serviceBInstance)
      .singleton();

    const container = createContainer();

    container
      .provide(depA, serviceADefinition)
      .provide(depB, serviceADefinition)

      // @ts-expect-error: depB is already provided, providing qualified instance twice is not allowed
      .provide(depB, serviceADefinition)
      .provide(depC, serviceBDefinition);
  });

  it("typecheck - parent resolvers types must be of a subset of the child", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();
    const depC = InjectionToken.of<TestServiceC>();
    const depD = InjectionToken.of<TestServiceD>();

    const serviceADefinition = ServiceDefinition.requires()
      .from(() => noopA)
      .scoped();

    const serviceBDefinition = ServiceDefinition.requires()
      .from(() => noopB)
      .singleton();

    const serviceCDefinition = ServiceDefinition.requires()
      .from(() => noopC)
      .singleton();

    const serviceDDefinition = ServiceDefinition.requires()
      .from(() => noopD)
      .singleton();

    const containerA = createContainer()
      .provide(depA, serviceADefinition)
      .provide(depB, serviceBDefinition);

    const containerB = createContainer()
      .provide(depC, serviceCDefinition)
      .provide(depB, serviceBDefinition);

    const root = containerB.resolver();

    // All provided deps in the parent (containerB) must also exist in the child
    assertThrows(() => {
      // @ts-expect-error: root resolver is not typed to a subset of containerA
      containerA.provide(depD, serviceDDefinition).resolver(root);
    });
  });

  it("no dependencies", () => {
    const depA = InjectionToken.of<TestServiceA>();

    const serviceInstance = {
      first: (value: number) => value,
    };

    const serviceDefinition = ServiceDefinition.requires()
      .from<TestServiceA>(() => serviceInstance)
      .singleton();

    const container = createContainer();

    // @ts-expect-error: Resolve should not exist until all dependencies are provided
    container.resolver;

    const resolver = container.provide(depA, serviceDefinition).resolver();

    assertEquals(resolver.resolve(depA), serviceInstance);
  });

  it("single dependency", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();

    const serviceADefinition = ServiceDefinition.requires(depB)
      .from((depB) => {
        return {
          first: (value: number) => value * depB.second(value),
        };
      })
      .singleton();

    const serviceBDefinition = ServiceDefinition.requires()
      .from<TestServiceB>(() => {
        return {
          second: (value: number) => value + 2,
        };
      })
      .singleton();

    const container = createContainer();

    // @ts-expect-error: Resolve should not exist until all dependencies are provided
    container.resolver;

    const resolver = container
      .provide(depA, serviceADefinition)
      .provide(depB, serviceBDefinition)
      .resolver();

    const depAInstance = resolver.resolve(depA);

    const value = 150;
    const result = depAInstance.first(value);

    assertEquals(result, value * (value + 2));
  });

  it("supports transient lifetimes", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();
    const depC = InjectionToken.of<TestServiceC>();

    const serviceADefinition = ServiceDefinition.requires(depC)
      .from((depC) => {
        return {
          first: (value: number) => depC.third(value),
        };
      })
      .singleton();

    const serviceBDefinition = ServiceDefinition.requires(depC)
      .from<TestServiceB>((depC) => {
        return {
          second: (value: number) => depC.third(value),
        };
      })
      .singleton();

    const serviceCDefinition = ServiceDefinition.requires()
      .from<TestServiceC>(() => {
        let state = 0;

        return {
          third: (value: number) => {
            state += value;
            return state;
          },
        };
      })
      .transient();

    const container = createContainer()
      .provide(depA, serviceADefinition)
      .provide(depB, serviceBDefinition)
      .provide(depC, serviceCDefinition);

    const resolver = container.resolver();

    const depAInstance = resolver.resolve(depA);
    const depBInstance = resolver.resolve(depB);

    assertEquals(depAInstance.first(1), 1);
    assertEquals(depBInstance.second(1), 1);
  });

  it("supports singleton lifetimes", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();
    const depC = InjectionToken.of<TestServiceC>();

    const serviceADefinition = ServiceDefinition.requires(depC)
      .from((depC) => {
        return {
          first: (value: number) => depC.third(value),
        };
      })
      .singleton();

    const serviceBDefinition = ServiceDefinition.requires(depC)
      .from<TestServiceB>((depC) => {
        return {
          second: (value: number) => depC.third(value),
        };
      })
      .singleton();

    const serviceCDefinition = ServiceDefinition.requires()
      .from<TestServiceC>(() => {
        let state = 0;

        return {
          third: (value: number) => {
            state += value;
            return state;
          },
        };
      })
      .singleton();

    const container = createContainer()
      .provide(depA, serviceADefinition)
      .provide(depB, serviceBDefinition)
      .provide(depC, serviceCDefinition);

    const resolver = container.resolver();

    const depAInstance = resolver.resolve(depA);
    const depBInstance = resolver.resolve(depB);

    assertEquals(depAInstance.first(1), 1);
    assertEquals(depBInstance.second(1), 2);
  });

  it("supports scoped lifetimes", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();
    const depC = InjectionToken.of<TestServiceC>();

    const serviceADefinition = ServiceDefinition.requires()
      .from(() => {
        let state = 0;

        return {
          first: (value: number) => {
            state += value;
            return state;
          },
        };
      })
      .scoped();

    const serviceBDefinition = ServiceDefinition.requires()
      .from<TestServiceB>(() => {
        return {
          second: (value: number) => value * 2,
        };
      })
      .singleton();

    const serviceCDefinition = ServiceDefinition.requires(depA, depB)
      .from<TestServiceC>((depA, depB) => {
        return {
          third: (value: number) => depA.first(value) + depB.second(value),
        };
      })
      .singleton();

    const container = createContainer()
      .provide(depA, serviceADefinition)
      .provide(depB, serviceBDefinition);

    const root = container.resolver();

    const childA = container.provide(depC, serviceCDefinition).resolver(root);
    const childB = container.provide(depC, serviceCDefinition).resolver(root);

    assertEquals(childA.resolve(depC).third(2), 6);
    assertEquals(childA.resolve(depC).third(2), 8);

    assertEquals(childB.resolve(depC).third(2), 6);
    assertEquals(childB.resolve(depC).third(2), 8);
  });

  it("allows partial resolvers to be used as root", () => {
    interface UserRequest {
      id?: number;
    }

    interface SessionService {
      getSession: () => { isAuthenticated: boolean };
    }

    interface ItemsService {
      getItems: () => null | string[];
    }

    const userRequest = InjectionToken.of<UserRequest>();
    const sessionService = InjectionToken.of<SessionService>();
    const itemsService = InjectionToken.of<ItemsService>();

    const sessionServiceDefinition = ServiceDefinition.requires(userRequest)
      .from<SessionService>((userRequest) => {
        return {
          getSession: () => {
            return {
              isAuthenticated: Boolean(userRequest.id),
            };
          },
        };
      })
      .scoped();

    const itemsServiceDefinition = ServiceDefinition.requires(sessionService)
      .from<ItemsService>((sessionService) => {
        return {
          getItems: () => {
            return sessionService.getSession().isAuthenticated
              ? ["item1", "item2"]
              : null;
          },
        };
      })
      .scoped();

    const container = createContainer()
      .provide(sessionService, sessionServiceDefinition)
      .provide(itemsService, itemsServiceDefinition);

    const root = container.resolver();

    function doRequest(id: number | undefined) {
      const userRequestResolver = container
        .provide(
          userRequest,
          ServiceDefinition.requires()
            .from(() => {
              return {
                id,
              };
            })
            .singleton()
        )
        .resolver(root);

      return userRequestResolver.resolve(itemsService).getItems();
    }

    assertEquals(doRequest(1), ["item1", "item2"]);
    assertEquals(doRequest(undefined), null);
    assertEquals(doRequest(1), ["item1", "item2"]);
    assertEquals(doRequest(undefined), null);
  });

  it("catches cyclical dependencies", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();

    const serviceADefinition = ServiceDefinition.requires(depA, depB)
      .from((a, b) => {
        return {
          first: (value: number) => value,
        };
      })
      .singleton();

    assertThrows(() => {
      createContainer().provide(depA, serviceADefinition).resolver();
    }, CyclicDependencyError);
  });
});

describe("Helpers", () => {
  it("typecheck - fromValue - error when invalid dep provided", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();

    const serviceADefinition = ServiceDefinition.requires(depB).fromValue({});

    const container = createContainer();

    // @ts-expect-error: Should have a type error as serviceADefinition does not match the type of depA
    container.provide(depA, serviceADefinition);
  });

  it("typecheck - asValue - no error when valid dep provided", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();

    const serviceADefinition = ServiceDefinition.requires(depB).fromValue({
      first: (value: number) => value,
    });

    const container = createContainer();

    container.provide(depA, serviceADefinition);
  });

  it("typecheck - asClass - error when invalid dep provided", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();

    const serviceADefinition = ServiceDefinition.requires(depB)
      .fromClass(
        class {
          constructor(depB: TestServiceB) {}
        }
      )
      .singleton();

    const container = createContainer();

    // @ts-expect-error: Should have a type error as serviceADefinition does not match the type of depA
    container.provide(depA, serviceADefinition);
  });

  it("typecheck - asClass - no error when valid dep provided", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();

    const serviceADefinition = ServiceDefinition.requires(depB)
      .fromClass(
        class {
          constructor(depB: TestServiceB) {}

          first(value: number) {
            return value
          }
        }
      )
      .singleton();

    const container = createContainer();

    container.provide(depA, serviceADefinition);
  });

  it("typecheck - asClass - error when invalid constructor args", () => {
    const depA = InjectionToken.of<TestServiceA>();
    const depB = InjectionToken.of<TestServiceB>();

    const serviceADefinition = ServiceDefinition.requires(depB)
      .fromClass(
        // @ts-expect-error: expects depB but got depC
        class {
          constructor(depC: TestServiceC) {}

          first(value: number) {
            return value
          }
        }
      )
      .singleton();

    const container = createContainer();

    container.provide(depA, serviceADefinition);
  });


});
