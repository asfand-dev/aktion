/**
 * Starter templates: complete documents built from node trees, offered when
 * creating a project. Pure builders (fresh ids per call), no runtime
 * dependency — they render through the exact same pipeline as hand-built
 * designs, so they double as living examples of good canvas structure.
 */
import type { DesignDocument, DesignNode, PropValue } from "./types";
import { createFrame, createNode, createPage } from "./document";

export interface Template {
  id: string;
  name: string;
  description: string;
  /** Small gradient used on the picker card. */
  swatch: [string, string];
  tags: string[];
  build: () => DesignDocument;
}

const n = (
  component: string,
  props: Record<string, PropValue> = {},
  children: DesignNode[] = [],
  name?: string,
) => createNode(component, props, children, name);

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?w=${w}&q=80`;

function doc(
  theme: string,
  frames: Array<{ name: string; width: number; height: number; x: number; children: DesignNode[]; background?: string }>,
  themeTokens?: Record<string, PropValue>,
): DesignDocument {
  const page = createPage("Page 1");
  for (const spec of frames) {
    const frame = createFrame(spec.name, spec.x, 0, spec.width, spec.height);
    if (spec.background) frame.background = spec.background;
    frame.children = spec.children;
    page.frames.push(frame);
  }
  return {
    version: 1,
    theme,
    ...(themeTokens ? { themeTokens: themeTokens as DesignDocument["themeTokens"] } : {}),
    pages: [page],
    symbols: [],
  };
}

// ---------------------------------------------------------------------------

const saasLanding = (): DesignDocument =>
  doc(
    "light",
    [
      {
        name: "Landing",
        width: 1280,
        height: 2350,
        x: 0,
        children: [
          n("Column", { gap: "none" }, [
            n("Navbar", {
              brand: "Driftline",
              items: [
                { label: "Product", to: "/product" },
                { label: "Pricing", to: "/pricing" },
                { label: "Docs", to: "/docs" },
              ],
              actions: { $expr: '[Button("Sign in", { variant: "ghost" }), Button("Start free", { variant: "primary" })]' },
            }),
            n("Section", { sx: { py: "3xl", px: "xl", textAlign: "center" } }, [
              n("Column", { gap: "md", align: "center" }, [
                n("Badge", { label: "New · Autopilot for schedules", tone: "primary" }),
                n("Heading", { content: "Plan your team's week in minutes" }),
                n("Text", {
                  value: "Driftline turns availability, workload and deadlines into a ready-to-ship schedule — automatically.",
                  variant: "large",
                  tone: "muted",
                }),
                n("Row", { gap: "sm", justify: "center" }, [
                  n("Button", { label: "Start free trial", variant: "primary", size: "lg" }),
                  n("Button", { label: "Watch demo", variant: "outline", size: "lg", icon: "play" }),
                ]),
              ]),
            ]),
            n("Section", { sx: { px: "xl", pb: "2xl" } }, [
              n("Image", { src: img("photo-1551288049-bebda4e38f71"), alt: "Product screenshot", sx: { w: "100%", radius: "lg", shadow: "lg" } }),
            ]),
            n("Section", { sx: { py: "2xl", px: "xl" } }, [
              n("Column", { gap: "lg" }, [
                n("Heading", { content: "Everything scheduling should be", sx: { textAlign: "center" } }),
                n("Grid", { columns: 3, gap: "lg" }, [
                  n("Card", {}, [n("CardHeader", { title: "Auto-balance", subtitle: "Workload spreads itself across the team fairly." })]),
                  n("Card", {}, [n("CardHeader", { title: "Conflict-free", subtitle: "Time off, meetings and handoffs are respected." })]),
                  n("Card", {}, [n("CardHeader", { title: "One-click publish", subtitle: "Everyone gets their week in Slack and email." })]),
                ]),
              ]),
            ]),
            n("Section", { sx: { py: "2xl", px: "xl", bg: "#f6f7fb" } }, [
              n("Row", { gap: "lg", justify: "center" }, [
                n("StatCard", { label: "Teams onboard", value: "2,300+", trend: "up", delta: "+18%" }),
                n("StatCard", { label: "Hours saved / week", value: "6.5", trend: "up", delta: "+0.8" }),
                n("StatCard", { label: "Schedule accuracy", value: "99.2%", trend: "flat", delta: "steady" }),
              ]),
            ]),
            n("Section", { sx: { py: "2xl", px: "xl" } }, [
              n("Testimonial", {
                quote: "We stopped arguing about shifts entirely. Driftline proposes, we approve, done.",
                name: "Maya Chen",
                role: "Ops lead, Fieldworks",
              }),
            ]),
            n("Footer", { tagline: "Driftline — calm scheduling for busy teams", legal: "© 2026 Driftline Inc." }),
          ], "Page layout"),
        ],
      },
    ],
  );

const analyticsDashboard = (): DesignDocument =>
  doc("light", [
    {
      name: "Dashboard",
      width: 1440,
      height: 1050,
      x: 0,
      background: "#f6f7fb",
      children: [
        n("Column", { gap: "none" }, [
          n("Navbar", {
            brand: "Pulseboard",
            items: [
              { label: "Overview", to: "/" },
              { label: "Reports", to: "/reports" },
              { label: "Alerts", to: "/alerts" },
            ],
          }),
          n("Column", { gap: "lg", sx: { p: "xl" } }, [
            n("PageHeader", { title: "Revenue overview", subtitle: "Rolling 30 days · updated hourly" }),
            n("Row", { gap: "lg" }, [
              n("StatCard", { label: "MRR", value: "$128,400", trend: "up", delta: "+6.2%" }),
              n("StatCard", { label: "Active users", value: "18,204", trend: "up", delta: "+3.1%" }),
              n("StatCard", { label: "Churn", value: "1.8%", trend: "down", delta: "-0.3pt" }),
              n("StatCard", { label: "NPS", value: "62", trend: "flat", delta: "±0" }),
            ]),
            n("Grid", { columns: 2, gap: "lg" }, [
              n("Card", {}, [
                n("CardHeader", { title: "Revenue by week", subtitle: "Last 12 weeks" }),
                n("BarChart", {
                  data: { $expr: '[{ label: "W1", value: 84 }, { label: "W2", value: 92 }, { label: "W3", value: 88 }, { label: "W4", value: 103 }, { label: "W5", value: 111 }, { label: "W6", value: 108 }, { label: "W7", value: 121 }, { label: "W8", value: 128 }]' },
                }),
              ]),
              n("Card", {}, [
                n("CardHeader", { title: "Top plans", subtitle: "Share of MRR" }),
                n("List", {}, [
                  n("ListItem", { title: "Scale — $499/mo", description: "41% of MRR", icon: "chart-line" }),
                  n("ListItem", { title: "Growth — $199/mo", description: "34% of MRR", icon: "chart-line" }),
                  n("ListItem", { title: "Starter — $49/mo", description: "25% of MRR", icon: "chart-line" }),
                ]),
              ]),
            ]),
            n("Card", {}, [
              n("CardHeader", { title: "Recent signups", subtitle: "Live feed" }),
              n("List", {}, [
                n("ListItem", { title: "Northwind Traders", description: "Growth plan · 2 minutes ago", icon: "user-plus" }),
                n("ListItem", { title: "Acme Robotics", description: "Scale plan · 18 minutes ago", icon: "user-plus" }),
                n("ListItem", { title: "Bluebird Media", description: "Starter plan · 1 hour ago", icon: "user-plus" }),
              ]),
            ]),
          ]),
        ], "Dashboard layout"),
      ],
    },
  ]);

const mobileOnboarding = (): DesignDocument =>
  doc("modern", [
    {
      name: "Welcome",
      width: 393,
      height: 852,
      x: 0,
      children: [
        n("Column", { gap: "none", sx: { h: "100%" } }, [
          n("Image", { src: img("photo-1571019613454-1cb2f99b2d8b", 800), alt: "Hero", sx: { w: "100%", h: "380px" } }),
          n("Column", { gap: "md", sx: { p: "xl" } }, [
            n("Heading", { content: "Train smarter, not longer" }),
            n("Text", { value: "Personalized 20-minute workouts that adapt to your energy, schedule and progress.", tone: "muted" }),
            n("Column", { gap: "sm", sx: { pt: "lg" } }, [
              n("Button", { label: "Get started", variant: "primary", size: "lg", fullWidth: true }),
              n("Button", { label: "I already have an account", variant: "ghost", fullWidth: true }),
            ]),
          ]),
        ], "Screen"),
      ],
    },
    {
      name: "Goals",
      width: 393,
      height: 852,
      x: 473,
      children: [
        n("Column", { gap: "lg", sx: { p: "xl" } }, [
          n("Progress", { value: 33, label: "Step 1 of 3" }),
          n("Heading", { content: "What's your goal?" }),
          n("Column", { gap: "sm" }, [
            n("Card", {}, [n("CardHeader", { title: "Build strength", subtitle: "3-4 sessions a week" })]),
            n("Card", {}, [n("CardHeader", { title: "Lose weight", subtitle: "Cardio-forward plan" })]),
            n("Card", {}, [n("CardHeader", { title: "Stay active", subtitle: "Short daily movement" })]),
          ]),
          n("Button", { label: "Continue", variant: "primary", size: "lg", fullWidth: true }),
        ], "Screen"),
      ],
    },
  ]);

const loginPage = (): DesignDocument =>
  doc("soft", [
    {
      name: "Sign in",
      width: 1280,
      height: 800,
      x: 0,
      background: "#eef1f7",
      children: [
        n("Center", { minHeight: "800px" }, [
          n("Card", { sx: { w: "420px", p: "lg" } }, [
            n("Column", { gap: "md" }, [
              n("Column", { gap: "2xs", align: "center" }, [
                n("Heading", { content: "Welcome back" }),
                n("Text", { value: "Sign in to your Lumen workspace", tone: "muted" }),
              ]),
              n("Input", { id: "email", label: "Email", placeholder: "you@company.com", type: "email" }),
              n("Input", { id: "password", label: "Password", placeholder: "••••••••", type: "password" }),
              n("Row", { justify: "between", align: "center" }, [
                n("Checkbox", { id: "remember", label: "Remember me" }),
                n("Link", { label: "Forgot password?", href: "#" }),
              ]),
              n("Button", { label: "Sign in", variant: "primary", size: "lg", fullWidth: true }),
              n("Separator", { label: "or" }),
              n("Button", { label: "Continue with Google", variant: "outline", fullWidth: true, icon: "google" }),
            ]),
          ]),
        ], "Centered card"),
      ],
    },
  ]);

const pricingPage = (): DesignDocument =>
  doc("light", [
    {
      name: "Pricing",
      width: 1280,
      height: 1500,
      x: 0,
      children: [
        n("Column", { gap: "none" }, [
          n("Navbar", {
            brand: "Driftline",
            items: [
              { label: "Product", to: "/product" },
              { label: "Pricing", to: "/pricing" },
            ],
          }),
          n("Section", { sx: { py: "2xl", px: "xl", textAlign: "center" } }, [
            n("Column", { gap: "sm", align: "center" }, [
              n("Heading", { content: "Pricing that scales with you" }),
              n("Text", { value: "Start free. Upgrade when your team does.", tone: "muted", variant: "large" }),
            ]),
          ]),
          n("Section", { sx: { px: "xl", pb: "2xl" } }, [
            n("Grid", { columns: 3, gap: "lg" }, [
              n("Card", {}, [
                n("Column", { gap: "sm", sx: { p: "md" } }, [
                  n("Text", { value: "Starter", variant: "large-heavy" }),
                  n("Heading", { content: "$0" }),
                  n("Text", { value: "For individuals trying things out", tone: "muted" }),
                  n("List", {}, [
                    n("ListItem", { title: "1 project", icon: "check" }),
                    n("ListItem", { title: "Community support", icon: "check" }),
                  ]),
                  n("Button", { label: "Start free", variant: "outline", fullWidth: true }),
                ]),
              ]),
              n("Card", { variant: "elevated" }, [
                n("Column", { gap: "sm", sx: { p: "md" } }, [
                  n("Row", { justify: "between", align: "center" }, [
                    n("Text", { value: "Growth", variant: "large-heavy" }),
                    n("Badge", { label: "Most popular", tone: "primary" }),
                  ]),
                  n("Heading", { content: "$19" }),
                  n("Text", { value: "Per member / month, billed yearly", tone: "muted" }),
                  n("List", {}, [
                    n("ListItem", { title: "Unlimited projects", icon: "check" }),
                    n("ListItem", { title: "Version history", icon: "check" }),
                    n("ListItem", { title: "Priority support", icon: "check" }),
                  ]),
                  n("Button", { label: "Start 14-day trial", variant: "primary", fullWidth: true }),
                ]),
              ]),
              n("Card", {}, [
                n("Column", { gap: "sm", sx: { p: "md" } }, [
                  n("Text", { value: "Enterprise", variant: "large-heavy" }),
                  n("Heading", { content: "Custom" }),
                  n("Text", { value: "Security review, SSO and dedicated support", tone: "muted" }),
                  n("List", {}, [
                    n("ListItem", { title: "SAML SSO", icon: "check" }),
                    n("ListItem", { title: "Audit logs", icon: "check" }),
                    n("ListItem", { title: "Dedicated CSM", icon: "check" }),
                  ]),
                  n("Button", { label: "Talk to sales", variant: "outline", fullWidth: true }),
                ]),
              ]),
            ]),
          ]),
          n("Section", { sx: { px: "xl", pb: "2xl" } }, [
            n("Column", { gap: "md" }, [
              n("Heading", { content: "Frequently asked questions", sx: { textAlign: "center" } }),
              n("Accordion", {}, [
                n("AccordionItem", { title: "Can I change plans later?" }, [
                  n("Text", { value: "Yes — upgrades apply immediately and downgrades at the next billing cycle." }),
                ]),
                n("AccordionItem", { title: "Is there a free trial?" }, [
                  n("Text", { value: "Growth includes a 14-day trial, no card required." }),
                ]),
                n("AccordionItem", { title: "What payment methods do you accept?" }, [
                  n("Text", { value: "All major cards, plus invoicing on Enterprise." }),
                ]),
              ]),
            ]),
          ]),
          n("Footer", { tagline: "Driftline — calm scheduling for busy teams" }),
        ], "Page layout"),
      ],
    },
  ]);

const productPage = (): DesignDocument =>
  doc(
    "light",
    [
      {
        name: "Product detail",
        width: 1280,
        height: 1250,
        x: 0,
        children: [
          n("Column", { gap: "none" }, [
            n("Navbar", {
              brand: "Fjord Supply",
              items: [
                { label: "Shop", to: "/shop" },
                { label: "Journal", to: "/journal" },
              ],
              actions: { $expr: '[Button("Cart (2)", { variant: "ghost", icon: "cart-shopping" })]' },
            }),
            n("Section", { sx: { p: "xl" } }, [
              n("Split", {
                right: {
                  $expr:
                    'Column([Badge("Back in stock", { tone: "success" }), Heading("Wanderer 35L Pack"), Rating(4.5, { count: 218 }), Heading("$189"), Text("Weatherproof, carry-on friendly and built to disappear on your back. Guaranteed for life.", { tone: "muted" }), Row([Button("Add to cart", { variant: "primary", size: "lg" }), Button("Save", { variant: "outline", size: "lg", icon: "heart" })], { gap: "sm" }), List([ListItem("Free shipping over $75", { icon: "truck" }), ListItem("30-day returns", { icon: "rotate-left" })])], { gap: "md" })',
                },
              }, [
                n("Image", { src: img("photo-1553062407-98eeb64c6a62"), alt: "Backpack", sx: { w: "100%", radius: "lg" } }),
              ]),
            ]),
            n("Section", { sx: { px: "xl", pb: "2xl" } }, [
              n("Column", { gap: "md" }, [
                n("Heading", { content: "You may also like" }),
                n("Grid", { columns: 3, gap: "lg" }, [
                  n("ProductCard", { title: "Fieldnotes Pouch", price: "$29", image: img("photo-1547949003-9792a18a2601", 800) }),
                  n("ProductCard", { title: "Trail Bottle 750ml", price: "$24", image: img("photo-1602143407151-7111542de6e8", 800) }),
                  n("ProductCard", { title: "Merino Beanie", price: "$35", image: img("photo-1576871337622-98d48d1cf531", 800) }),
                ]),
              ]),
            ]),
            n("Footer", { tagline: "Fjord Supply — gear for the long way round" }),
          ], "Page layout"),
        ],
      },
    ],
    { name: "light", colors: { primary: "#166534", primaryHover: "#14532d", accent: "#b45309" } },
  );

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank canvas",
    description: "One empty desktop frame — start from scratch.",
    swatch: ["#33363d", "#1e2024"],
    tags: ["Empty"],
    build: () => {
      const page = createPage("Page 1");
      const frame = createFrame("Frame 1", 0, 0, 1280, 800);
      page.frames.push(frame);
      return { version: 1, theme: "light", pages: [page], symbols: [] };
    },
  },
  {
    id: "saas-landing",
    name: "SaaS landing page",
    description: "Hero, feature grid, social proof and footer.",
    swatch: ["#6366f1", "#06b6d4"],
    tags: ["Marketing", "Desktop"],
    build: saasLanding,
  },
  {
    id: "analytics-dashboard",
    name: "Analytics dashboard",
    description: "KPI row, charts and activity feed on a shell.",
    swatch: ["#0ea5e9", "#22d3ee"],
    tags: ["App", "Data"],
    build: analyticsDashboard,
  },
  {
    id: "mobile-onboarding",
    name: "Mobile onboarding",
    description: "Two phone screens: welcome and goal picker.",
    swatch: ["#f97316", "#f43f5e"],
    tags: ["Mobile", "Flow"],
    build: mobileOnboarding,
  },
  {
    id: "login",
    name: "Login page",
    description: "Centered auth card with social sign-in.",
    swatch: ["#64748b", "#94a3b8"],
    tags: ["Auth", "Desktop"],
    build: loginPage,
  },
  {
    id: "pricing",
    name: "Pricing page",
    description: "Three tiers with a highlighted plan and FAQ.",
    swatch: ["#7c3aed", "#db2777"],
    tags: ["Marketing", "Desktop"],
    build: pricingPage,
  },
  {
    id: "product-page",
    name: "E-commerce product",
    description: "Product detail split with related items.",
    swatch: ["#166534", "#b45309"],
    tags: ["Shop", "Desktop"],
    build: productPage,
  },
];
