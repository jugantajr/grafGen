# Pro Graph Code Builder

A precision mathematics IDE and drawing tool designed specifically for graph theory, matrix analysis, and academic publishing. This tool allows you to visually construct complex graphs and instantly generate publication-ready LaTeX code in both **TikZ** and **PSTricks** formats.

## Key Features

* **Live LaTeX Rendering:** Powered by KaTeX, all text and node labels render standard LaTeX math (e.g., $\lambda_{max}$, $x^2$) directly on the canvas.
* **Graph Macros:** Instantly generate perfectly symmetrical standard graphs with one click, including Complete Graphs ($K_n$), Cycles ($C_n$), Paths ($P_n$), Stars, and Bipartite Graphs ($K_{m,n}$).
* **Precision Snapping:** Align vertices perfectly using dynamic X/Y axis guide lines and grid snapping.
* **Advanced Geometric Edges:** Draw straight lines, circles, standard arcs, elliptic arcs, and quadratic bezier curves (perfect for parallel edges or self-loops).
* **Smart Label Positioning:** Place edge labels Above, Below, Left, Right, or directly "On Line" (which automatically breaks the line with a white background, standard for LaTeX figures).

## Keyboard Shortcuts

* **`Shift` + `Click`**: Select multiple items (points, edges, texts) at once.
* **`Ctrl` + `A`** (or **`Cmd` + `A`**): Select all elements on the canvas.
* **`Ctrl` + `Z`**: Undo.
* **`Ctrl` + `Y`**: Redo.
* **`Delete`** or **`Backspace`**: Erase selected items.

## How to Use

1.  **Drawing Points & Lines:** Select the `Point` tool to drop vertices. Select `Line` (or `Curve`) and click two points to connect them. The tools are *continuous*—you can keep clicking to draw rapidly!
2.  **Editing Properties:** Switch to the `Select` tool (Arrow) and click any item. The Properties Panel will reveal specific inputs for that shape (Radius, Curve Offset, Start/End Angles, Colors, Line Styles).
3.  **Moving Elements:** Use the `Move` tool to drag individual nodes or grouped selections. Dragging an empty space on the canvas will pan your view.
4.  **Exporting Code:** As you draw, the right panel automatically updates. Select your preferred LaTeX package (`TikZ` or `PSTricks`) from the dropdown, copy the code, and paste it directly into your `.tex` document.
5.  **Saving Work:** Click `Save JSON` to download your graph's data state. You can reload this file later using `Load JSON` to continue editing.