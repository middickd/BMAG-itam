# Bob Moore ITAM UI — how to build with this design system

A small React + Tailwind component set (shadcn-style primitives on Radix UI) used to build IT Asset Management screens. Components ship pre-styled; you compose them.

## Setup
- **No provider/wrapper is required.** Every component renders correctly on its own — there is no ThemeProvider, context, or root to mount. Just import and use.
- **Theme tokens are CSS variables** defined in `styles.css` for a light theme (default) and a `.dark` theme. To render dark, put `className="dark"` on an ancestor element. Don't hard-code hex colors — use the token classes/variables below so light/dark both work.
- Import components from the design system package (named exports), e.g. `import { Button, Card, CardHeader } from "<ds>"`.

## Styling idiom — Tailwind utilities + variant props
This is a Tailwind utility-class system. Style in two ways, in this order of preference:

1. **Variant props on the component** (the primary lever — don't re-style with classes what a prop already does):
   - `Button` — `variant`: `default` | `secondary` | `outline` | `destructive` | `ghost` | `link`; `size`: `default` | `sm` | `lg` | `icon`
   - `Badge` — `variant`: `default` | `secondary` | `success` | `warning` | `destructive` | `muted` | `outline`
   - `StatusBadge` — `status`: `in_stock` | `reserved` | `deployed` | `maintenance` | `retired` | `lost` | `open` | `resolved` (renders a correctly-colored Badge; use this for asset/ticket state instead of a raw Badge)
   - `Avatar` — `name` (initials are derived), optional `color` (hex) and `size` (px)

2. **Tailwind utility classes that reference the design tokens** for layout and surfaces. Use the token names, not raw colors:
   - Surfaces: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-secondary`, `bg-accent`
   - Text: `text-foreground`, `text-muted-foreground` (secondary text), `text-primary`, `text-primary-foreground`, `text-destructive`
   - Brand/intent fills: `bg-primary text-primary-foreground` (brand blue, primary action), `bg-destructive text-destructive-foreground` (danger)
   - Borders: `border`, `border-input`; radius `rounded-md` / `rounded-lg` / `rounded-xl` (focus rings are built into the interactive components already)
   - The underlying CSS variables (HSL triples) are available directly if you need them in `style`: `hsl(var(--primary))`, `hsl(var(--muted-foreground))`, `hsl(var(--border))`, etc.

   Standard layout/spacing/typography utilities (`flex`, `grid`, `gap-*`, `p-*`, `text-sm`, `font-medium`, …) are available. For unusual one-off spacing, an inline `style` is fine.

## Compound components (compose the parts)
- **Card**: `Card > CardHeader > (CardTitle, CardDescription)`, then `CardContent`, then `CardFooter`.
- **Dialog**: `Dialog > DialogContent > (DialogHeader > DialogTitle + DialogDescription, …, DialogFooter)`. Open via `DialogTrigger` or the controlled `open` prop. Put the primary action last in `DialogFooter` (it right-aligns on desktop).
- **Select**: `Select > (SelectTrigger > SelectValue) + (SelectContent > SelectItem…)`.
- **Tabs**: `Tabs defaultValue > (TabsList > TabsTrigger…) + TabsContent…`.
- **Label**: pair with an input via `htmlFor`/`id`.

## Where the source of truth is
- `styles.css` (and its `@import`s, incl. `_ds_bundle.css`) — the tokens and component styles. Read it before inventing colors.
- Each component's `<Name>.d.ts` (exact prop types) and `<Name>.prompt.md` (usage + examples) under `components/`.

## Idiomatic example
```tsx
import { PageHeader, Button, Card, CardHeader, CardTitle, CardDescription, CardContent, StatusBadge } from "<ds>";

<div className="p-6">
  <PageHeader
    title="Assets"
    description="1,284 tracked devices across 6 locations"
    actions={<Button size="sm">Add asset</Button>}
  />
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>MacBook Pro 16"</CardTitle>
      <CardDescription>BMAG-04821 · Dana Whitfield</CardDescription>
    </CardHeader>
    <CardContent>
      <StatusBadge status="deployed" />
    </CardContent>
  </Card>
</div>
```
