# design-sync notes — BMAG ITAM UI

Repo-specific gotchas for `/design-sync`. Read before any re-sync.

## Source shape & setup
- This is an **application**, not a published component library — there is no library `dist/` of exported components and no Storybook. We sync via a **curated entry barrel** at `.design-sync/entry.tsx`, passed through `cfg.entry`, which re-exports exactly the in-scope components from the real app source.
- `cfg.entry` (`.design-sync/entry.tsx`) is resolved cwd-relative. Because it sits at repo root level, the converter's PKG_DIR walks up to the **repo root** (`bmag-itam`), so all `cfg.*` paths are written **repo-root-relative** (`client/src/...`, `client/dist/...`, `client/tsconfig.json`).
- `--node-modules ./node_modules` points at the **repo root** node_modules — React is hoisted there by npm workspaces and is NOT present in `client/node_modules`.
- `cfg.tsconfig = client/tsconfig.json` is required so esbuild resolves the `@/*` → `src/*` alias used throughout the components.
- No `cfg.provider` needed — the Radix-based components (Dialog, Select, Tabs, Label) render fine headless without an app-level context provider.
- Build command: `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle` then `node .ds-sync/package-validate.mjs ./ds-bundle`.

## Styling
- Component styling is **Tailwind utility classes** compiled into `client/dist/assets/index-<hash>.css`, which `cfg.cssEntry` points at. Confirmed applying correctly (Button renders `bg-primary` blue + `rounded-md`).
- In authored preview `.tsx` files, use **inline styles** for preview layout glue (flex rows, gaps, padding) — NOT arbitrary Tailwind classes. The compiled CSS only contains utilities the *app* actually used; a layout class the app never used won't exist in `_ds_bundle.css` and won't style. Component-internal classes (bg-primary, etc.) are safe because the app uses them.

## Font: system-font design system (accepted [FONT_MISSING])
- `[FONT_MISSING] Inter` is **accepted, not resolved** — and deliberately so. The app's font stack (`client/src/index.css`) is `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif`. Inter is **dead-last** and the app never loads it as a webfont. The real app renders in system-ui / Segoe UI. Shipping Inter would make previews LESS faithful (Inter would never win the cascade anyway). No `@font-face` is shipped by design; `cfg.runtimeFontPrefixes` intentionally NOT set (Inter is not served at runtime either — it's just a trailing fallback name).

## Grouping
- All 11 components land in a single `general` group (their source dirs — `components/`, `components/ui/` — are all "generic" path segments the grouper skips, and there's no JSDoc `@category`). Functional but flat.
- **Future refinement**: split into Primitives / Patterns via `cfg.docsMap` stubs with `category:` frontmatter (note: a stub doc becomes the `prompt.md` body, so give it a real short body, not just frontmatter, or the synthesized doc is lost).

## Re-sync risks (watch-list)
- **`cfg.cssEntry` filename is build-hashed and gitignored.** `client/dist/` is in `.gitignore`, and Vite emits `index-<hash>.css` with a NEW hash every build. On a fresh clone or after a client rebuild: run the client build (`npm run build`), then update `cfg.cssEntry` to the new `client/dist/assets/index-<hash>.css` filename before re-running the converter. The current pinned name (`index-DxA-oGcZ.css`) WILL go stale.
- The curated `.design-sync/entry.tsx` must be kept in sync with the in-scope component set: adding/removing a component means editing both `entry.tsx` AND `cfg.componentSrcMap`.
- Components are pulled from live app source — if a component's props/styling change in the app, a re-sync picks it up automatically (that's the point), but re-grade authored previews after a major change.

## Known render warns
- `[FONT_MISSING] Inter` — expected and accepted (see "Font" above). Not a new warn.
- `[TOKENS_MISSING]` "1 missing, below threshold" — one CSS custom property referenced but not defined in the scraped CSS; below the validator threshold, non-blocking.

## Authored preview decisions
- All 11 in-scope components have authored previews under `.design-sync/previews/` and grade `good` (cache in `.design-sync/.cache/review/`, gitignored).
- **Select**: only the closed trigger state is shown — the open dropdown is interaction-driven (Radix portal needs a click) and can't render statically. This is intentional, not a gap.
- **Dialog**: rendered open via the controlled `open` prop with `cfg.overrides.Dialog = {cardMode:"single", viewport:"720x460"}` — the wide viewport puts the footer above Radix's `sm:` (640px) breakpoint so buttons render as a right-aligned row (desktop layout) rather than stacked.
- **PageHeader**: `cfg.overrides.PageHeader = {cardMode:"column"}` (full-width bar, one export per row).
- Preview layout glue uses inline styles (see "Styling" above for why).
