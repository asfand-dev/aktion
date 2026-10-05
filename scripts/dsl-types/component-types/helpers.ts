/** Curated types for the components of src/library/components/helpers.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Async: {
    props: {
      resource: "unknown",
      loading: "Children",
      error: "Children",
      empty: "Children",
      data: "Children",
      retry: "() => void",
    },
  },
  ErrorBoundary: {
    props: {
      fallback: "Children",
      onError: "(error: unknown) => void",
      onRetry: "() => void",
    },
  },
  Lazy: {
    types: {
      LazyLoader: "export type LazyLoader = (() => Children | PromiseLike<Children | void>) | PromiseLike<Children | void> | Children;",
    },
    props: {
      loader: "LazyLoader",
      fallback: "Children",
      error: "Children",
      onError: "(error: unknown) => void",
      retry: "() => void",
    },
  },
  Portal: {
    props: {
      target: "string",
    },
  },
  Show: {
    props: {
      when: "unknown",
      fallback: "Children",
    },
  },
} satisfies ComponentTypeTable;
