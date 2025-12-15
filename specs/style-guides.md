# Theme System Best Practices & Generation Rules

This document defines rules for designing and generating UI themes that are:

* Scalable to many themes
* Visually coherent
* Accessible by default
* Guarded against poor contrast or unusable color combinations

The system assumes **token-based theming** with semantic colors derived from a small set of inputs.

---

## 1. Theme Architecture Principles

### 1.1 Token Layers

Themes MUST be structured into distinct layers:

1. **Primitive / Brand Colors**

   * A perceptual lightness ramp (e.g. `50 → 900`)
   * Single hue family per theme
2. **Semantic Tokens**

   * UI meaning (backgrounds, text, borders, actions)
   * No direct UI usage of raw brand tokens
3. **Component Tokens**

   * Buttons, inputs, bubbles, etc.
   * Derived strictly from semantic tokens

**Rule:**
UI components MUST reference semantic tokens only.

---

## 2. Inputs for Algorithmic Theme Generation

A theme MAY be generated from the following minimal inputs:

* Base hue (H)
* Saturation range (S_min, S_max)
* Lightness range (L_min, L_max)
* Brightness mode: `light | dark`
* Contrast strictness factor: `0.6 – 1.0`

This enables deterministic generation while preserving design intent.

---

## 3. Brand Color Ramp Rules

### 3.1 Perceptual Consistency

Brand ramps MUST be generated in a perceptual color space:

* OKLCH or LAB preferred
* HSL is NOT sufficient

**Rule:**

* Lightness must change monotonically
* Hue drift ≤ 5° across the ramp

### 3.2 Ramp Semantics

| Token   | Intended Use    |
| ------- | --------------- |
| 50–100  | App backgrounds |
| 200–300 | Subtle surfaces |
| 400–500 | Primary actions |
| 600–700 | Hover / active  |
| 800–900 | Text / emphasis |

---

## 4. Semantic Color Derivation Rules

### 4.1 Backgrounds

* `appBg` → brand.50–100 (light) or brand.900–800 (dark)
* `surfaceBg` MUST be neutral or near-white/near-black
* Nested surfaces must differ by ΔL ≥ 4

### 4.2 Text

Text colors MUST follow luminance hierarchy:

| Token      | Contrast Target |
| ---------- | --------------- |
| text       | ≥ 4.5:1         |
| textMuted  | ≥ 3.0:1         |
| textSubtle | ≥ 2.4:1         |

**Rule:**
Text MUST NOT use pure brand mid-tones (400–600) directly.

---

## 5. Accessibility Guardrails

### 5.1 Contrast Enforcement

The system MUST validate contrast using WCAG 2.x formulas.

* Primary UI text: **AA minimum**
* Critical UI (buttons, inputs): **AA preferred**
* Relaxation factor MAY reduce thresholds by up to 40% for non-critical UI

Example:

```
effectiveThreshold = baseThreshold × strictnessFactor
```

### 5.2 Auto-Correction

If contrast fails:

1. Adjust lightness first
2. Adjust saturation second
3. Adjust hue last (≤ 10°)

---

## 6. Status & Feedback Colors

Status colors SHOULD NOT be derived from the brand hue.

| Status  | Hue Rule           |
| ------- | ------------------ |
| Success | Green (120° ± 15°) |
| Warning | Amber (40° ± 15°)  |
| Error   | Red (0° ± 15°)     |
| Info    | Brand hue          |

**Rule:**
Status colors MUST be readable on both app and surface backgrounds.

---

## 7. Interactive Elements

### 7.1 Buttons

Primary buttons MUST:

* Use brand.500–600 for background
* Use neutral text (white or near-white)
* Increase contrast on hover (darken by ΔL ≥ 4)

Secondary buttons MUST:

* Use surface-derived backgrounds
* Share text color with standard text tokens

### 7.2 Focus States

* Focus color MUST be perceptually distinct from hover
* Focus MUST increase contrast, not reduce it

---

## 8. Borders & Dividers

* Borders MUST rely on lightness difference, not hue contrast
* Border contrast SHOULD be subtle but visible:

  * ΔL ≈ 3–6 from background

---

## 9. Theme Metadata Requirements

Each theme MUST declare:

```json
{
  "brightness": "light | dark",
  "colorFamily": "string",
  "accessibilityTier": "standard | relaxed | high"
}
```

This metadata informs automatic validation and UI selection.

---

## 10. Theme Validation Checklist

A theme is considered valid only if:

* No semantic token violates minimum contrast rules
* No text uses raw brand mid-tones
* All interactive states are visually distinct
* Status colors remain distinguishable for common color-vision deficiencies

---

## 11. Design Philosophy

* Fewer highly accessible themes are preferable to many flawed ones
* Algorithmic generation is a safety net, not a replacement for taste
* Brand identity must never override legibility
