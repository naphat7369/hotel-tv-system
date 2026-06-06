---
name: Hospitality Command
colors:
  surface: '#051424'
  surface-dim: '#051424'
  surface-bright: '#2c3a4c'
  surface-container-lowest: '#010f1f'
  surface-container-low: '#0d1c2d'
  surface-container: '#122131'
  surface-container-high: '#1c2b3c'
  surface-container-highest: '#273647'
  on-surface: '#d4e4fa'
  on-surface-variant: '#c6c6cd'
  inverse-surface: '#d4e4fa'
  inverse-on-surface: '#233143'
  outline: '#909097'
  outline-variant: '#45464d'
  surface-tint: '#bec6e0'
  primary: '#bec6e0'
  on-primary: '#283044'
  primary-container: '#0f172a'
  on-primary-container: '#798098'
  inverse-primary: '#565e74'
  secondary: '#b9c7e0'
  on-secondary: '#233144'
  secondary-container: '#3c4a5e'
  on-secondary-container: '#abb9d2'
  tertiary: '#dec29a'
  on-tertiary: '#3e2d11'
  tertiary-container: '#231500'
  on-tertiary-container: '#957d5a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d5e3fd'
  secondary-fixed-dim: '#b9c7e0'
  on-secondary-fixed: '#0d1c2f'
  on-secondary-fixed-variant: '#3a485c'
  tertiary-fixed: '#fcdeb5'
  tertiary-fixed-dim: '#dec29a'
  on-tertiary-fixed: '#271901'
  on-tertiary-fixed-variant: '#574425'
  background: '#051424'
  on-background: '#d4e4fa'
  surface-variant: '#273647'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 32px
  gutter: 20px
---

## Brand & Style

This design system is engineered for high-stakes hospitality environments where clarity and reliability are paramount. The brand personality is **Professional, Technical, and Premium**, striking a balance between an enterprise CMS and the luxury aesthetic of the hospitality industry.

The design style utilizes **Modern Minimalism** with a focus on functional density. It avoids unnecessary decoration, instead using precise alignment, ample whitespace, and a sophisticated color palette to guide hotel staff through complex TV fleet management tasks. The interface should feel "invisible"—getting out of the user's way while providing a rock-solid sense of system status and control.

## Colors

The palette is anchored by **Deep Charcoal and Slate**, providing a high-end, cinematic feel appropriate for media management. 

- **Primary:** A deep, authoritative blue-charcoal used for navigation and primary actions.
- **Surface Strategy:** In dark mode, surfaces use subtle shifts in value (Slate 900 to 950) to create hierarchy rather than heavy borders.
- **Semantic Indicators:** High-chroma green, red, and amber are reserved strictly for system status (e.g., "Online", "Signal Lost", "Update Required") to ensure they immediately draw the eye against the neutral backdrop.
- **Contrast:** Maintain a minimum of 7:1 contrast ratio for all body text to ensure readability in dimly lit hotel back-offices or control rooms.

## Typography

The design system utilizes **Inter** for its exceptional legibility and neutral, professional character. 

- **Hierarchy:** Use `display-lg` sparingly for dashboard overviews. `headline-sm` is the workhorse for card titles and section headers.
- **Labels:** Small, uppercase labels with increased letter spacing are used for table headers and metadata categories to distinguish them from actionable data.
- **Technical Data:** Use a monospaced font (JetBrains Mono) for IP addresses, MAC addresses, and device IDs to ensure character distinction (e.g., 0 vs O).
- **Mobile scaling:** For small screens, `display-lg` should scale down to 24px to maintain layout integrity.

## Layout & Spacing

The layout follows a **Fixed Sidebar / Fluid Content** model. 

- **Grid:** A 12-column system is used for the main content area. Gutters are fixed at 20px to maintain a tight, information-dense display suitable for monitoring.
- **Sidebar:** Fixed at 280px. It contains the primary navigation and a "System Health" mini-widget at the bottom.
- **Density:** The system defaults to a "Comfortable" density, but data tables should support a "Compact" mode (8px cell padding) for managing large fleets of 500+ rooms.
- **Breakpoints:** 
  - Desktop: 1440px+
  - Tablet: 1024px (Sidebar collapses to icons)
  - Mobile: 768px (Sidebar moves to a bottom tray or hamburger menu)

## Elevation & Depth

This design system uses **Tonal Layering** and **Low-Contrast Outlines** instead of heavy shadows to maintain a modern, flat aesthetic.

- **Level 0 (Background):** The base canvas (`#020617`).
- **Level 1 (Cards/Sidebar):** Raised one step (`#0F172A`) with a subtle 1px border (`#1E293B`).
- **Level 2 (Modals/Popovers):** Raised with a soft, neutral-black shadow (20% opacity, 12px blur) and a slightly lighter surface (`#1E293B`).
- **Interactions:** On hover, cards should not lift but rather change their border color to the primary light blue or increase the stroke weight by 0.5px.

## Shapes

The shape language is **Soft and Precise**. 

- **Standard Radius:** 0.25rem (4px) is the default for all buttons, input fields, and small UI elements. This provides a professional, "tooled" look.
- **Container Radius:** 0.5rem (8px) for cards and main content containers to create a distinct separation from the background.
- **Interactive Elements:** Checkboxes use a 2px radius, while radio buttons and toggle tracks are fully rounded (pill-shaped) to clearly differentiate selection types.

## Components

- **Side Navigation:** Vertical layout using icons with 20px optical sizing. Active states use a "left-border accent" in primary blue and a subtle background tint.
- **Data Tables:** Zebra-striping is avoided; use subtle 1px horizontal dividers. The first column (usually Room Number or TV Name) is pinned and semi-bolded.
- **Status Badges:** Small, pill-shaped indicators with low-opacity backgrounds (e.g., 10% green background with 100% green text) for status updates.
- **Channel Cards:** 16:9 aspect ratio thumbnails for TV channel previews. Overlays should include the channel number and "Signal Strength" meter.
- **Toggle Switches:** Used for global settings like "Guest Mode" or "Dark Mode." The track should be Slate 700, and the thumb should be white.
- **Buttons:**
  - **Primary:** Solid Deep Blue with white text.
  - **Secondary:** Transparent with a Slate border.
  - **Ghost:** For low-priority actions in tables, appearing only on hover.