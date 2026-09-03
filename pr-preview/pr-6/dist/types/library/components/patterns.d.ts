import { ComponentSpec } from '../types.js';
export declare const Hero: ComponentSpec;
export declare const PageHeader: ComponentSpec;
export declare const EmptyState: ComponentSpec;
export declare const TimelineItem: ComponentSpec;
export declare const Timeline: ComponentSpec;
export declare const FeatureItem: ComponentSpec;
export declare const FeatureGrid: ComponentSpec;
export declare const Testimonial: ComponentSpec;
export declare const ProfileCard: ComponentSpec;
export declare const Comment: ComponentSpec;
export declare const Banner: ComponentSpec;
export declare const KanbanCard: ComponentSpec;
export declare const KanbanColumn: ComponentSpec;
export declare const KanbanBoard: ComponentSpec;
export declare const SectionHeader: ComponentSpec;
export declare const Toolbar: ComponentSpec;
export declare const SidebarItem: ComponentSpec;
export declare const SidebarSection: ComponentSpec;
export declare const Sidebar: ComponentSpec;
export declare const AppShell: ComponentSpec;
export declare const SplitView: ComponentSpec;
export declare const DescriptionItem: ComponentSpec;
/**
 * `ActionStripe` is a full-width, clickable navigation row: an optional
 * leading icon, a label with optional description, an optional trailing
 * value/status, and a chevron affordance signalling "this row goes
 * somewhere". Stack several to build settings screens, product menus, and
 * drill-down lists — the row-based counterpart to a grid of `Tile`s.
 *
 * Unlike `ListItem` (presentational content row) an ActionStripe is always
 * interactive and renders as a real `<button>`/`<a>`.
 */
export declare const ActionStripe: ComponentSpec;
export declare const DescriptionList: ComponentSpec;
export declare const StatusDot: ComponentSpec;
export declare const PricingCard: ComponentSpec;
export declare const PricingTable: ComponentSpec;
export declare const MediaCard: ComponentSpec;
/**
 * Render a tiny inline sparkline as an SVG. Shared by `Stats`, `StatCard`,
 * and the standalone `Sparkline` component so the visual language stays
 * consistent across surfaces. `tone` maps to a CSS variable so themes can
 * override the stroke colour.
 */
export declare function renderInlineSparkline(values: number[], tone?: string): SVGSVGElement;
export declare const Stats: ComponentSpec;
export declare const Tile: ComponentSpec;
export declare const Notification: ComponentSpec;
export declare const PersonChip: ComponentSpec;
