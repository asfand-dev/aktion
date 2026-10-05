/** Curated types for the components of src/library/components/navigation.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Breadcrumb: {
    types: {
      BreadcrumbCrumbData: `export interface BreadcrumbCrumbData {
  readonly label: string | number;
  readonly to?: string;
  readonly href?: string;
  readonly icon?: string;
}`,
      BreadcrumbEntry: "export type BreadcrumbEntry = AktionNode<\"BreadcrumbItem\"> | string | BreadcrumbCrumbData;",
    },
    props: {
      items: "readonly BreadcrumbEntry[]",
      onItemClick: "(index: number, label: string) => void",
      homeIcon: "boolean | string",
    },
  },
  BreadcrumbItem: {
    props: {
      onClick: "() => void",
    },
  },
  NavbarItem: {
    props: {
      onClick: "() => void",
    },
  },
  Pagination: {
    props: {
      onChange: "(page: number) => void",
      onPerPageChange: "(perPage: number) => void",
    },
  },
} satisfies ComponentTypeTable;
