# Agent Skill: UI/UX & Design System Standard

## Objective
Apply modern, cohesive, and accessible UI design standards using Tailwind CSS and shadcn/ui. Ensure all code generated or refactored adheres to clean visual hierarchy and professional aesthetics.

---

## 1. Visual Hierarchy & Spacing
- **Spacing Scale**: Use a consistent 8pt-based scale for layouts (`gap-4`, `gap-6`, `p-6`, `space-y-4`). Avoid arbitrary values like `p-[13px]`.
- **Card Containers**: Wrap section contents in subtle card structures using shadcn/ui `<Card>` or `border bg-card text-card-foreground shadow-sm rounded-xl`.
- **Primary Actions**: Limit prominent primary buttons (`variant="default"`) to 1-2 per viewport. Secondary actions must use `variant="outline"` or `variant="ghost"`.

---

## 2. Color Palette & Typography
- **Semantic Colors**: Use theme variables (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `bg-muted`) instead of hardcoded hex values or raw colors (e.g., avoid `text-gray-500`).
- **Contrast**: Ensure text readability. Body text should use `text-foreground` or `text-muted-foreground`. Do not use overly light text shades on light backgrounds.
- **Typography Scale**:
  - Main Heading: `text-2xl font-bold tracking-tight` or `text-3xl font-bold`
  - Section Title: `text-lg font-semibold`
  - Subtext/Labels: `text-sm text-muted-foreground`

---

## 3. Micro-Interactions & States
- **Hover & Focus**: Every interactive element (buttons, cards, links) must have clear hover and focus states (`hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2`).
- **Loading States**: Use shadcn/ui `<Skeleton />` for async data fetching instead of raw text loaders. Add `disabled` states and spinner icons to buttons during submit actions.
- **Empty States**: Never leave blank spaces for empty lists or tables. Provide an empty state icon, title, short description, and a call-to-action button.

---

## 4. Responsive & Layout Rules
- **Mobile First**: Default to single-column or flex-col layout on small screens (`flex flex-col md:flex-row`, `grid grid-cols-1 md:grid-cols-3`).
- **Component Granularity**: Break complex UI views into small, reusable components inside `components/ui/` or `components/features/`.