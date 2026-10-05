# LogicNova — Digital Logic & Computer Organization Simulation Lab

Frontend-only Vite + React prototype designed for local testing and debugging.

## Run locally

```bash
npm install
npm run dev
```

Then open the localhost URL printed by Vite.

## Included

- Animated binary convergence landing page with central light/blast reveal
- Smooth scroll-reveal transitions across landing sections
- Local name + password profile with generated Lab ID
- Browser-local profile history
- Bright, Purple Dark, and Ocean themes
- Mobile-first responsive dashboard/navigation
- 2, 3 and 4-variable K-map layouts in Gray-code order
- Minterm and maxterm input with automatic focus switching to SOP/POS
- Custom single-letter K-map variable labels (for example A/B/C/D or W/X/Y/Z)
- SOP reduction by grouping 1s
- POS reduction by grouping 0s of the SAME function
- “Find POS for these minterms” workflow
- Optional don't-care terms
- Textbook-style colored loop overlays for single, pair, quad and octet groups, including overlap/wrap indicators
- Implicant / prime implicant / essential prime implicant analysis
- Truth table generation
- K-map → SOP logic circuit
- K-map → POS logic circuit
- Boolean Algebra step-by-step law trace with granular law-by-law transitions (Complement, Identity, Distributive, Absorption, Involution, De Morgan, etc.)
- Boolean expressions accept single-letter variables across A–Z, including X/Y/Z
- Boolean Algebra → logic circuit
- AND, OR, NOT, NAND, NOR, XOR, XNOR interactive gate lab
- Entered input table + truth table + live output
- Gate-level circuit representation
- Decimal / Binary / Octal / Hexadecimal conversion
- ASCII and byte analysis
- Left-shift / right-shift comparison
- No backend, API, database, or authentication service required for this prototype

## Notes

The K-map engine is intentionally frontend-only and supports 2/3/4 variables. The local login is a visual/prototype authentication flow; do not use it as real security.


## Final UI pass

The toolbar controls are responsive and overlap-safe across desktop, tablet, and mobile widths. K-map textbook loops use the same fixed row geometry as the matrix and are inset so labels and cell values remain readable.
