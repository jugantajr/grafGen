# 📈 grafGen

**A precision mathematics IDE designed specifically for graph theory, matrix analysis, and academic publishing.**

grafGen bridges the gap between a tactile drawing application and a heavy computational sandbox. It allows you to visually construct complex graphs and instantly generate publication-ready LaTeX code, Adjacency/Laplacian matrices, and Python scripts.

## ✨ Key Features
* **Real-time LaTeX Generation:** Output perfectly formatted `TikZ` and `PSTricks` code.
* **Live Mathematical HUD:** Instantly calculates Order $|V|$, Size $|E|$, Degree $d(v)$, and the Eigenvalue Spectrum $Spec(A)$.
* **Algorithmic Graph Theory:** Features built-in force-directed physics, greedy coloring algorithms, and BFS bipartite checking.
* **Smart Exporting:** Download transparent, print-ready PNGs (even while working in Dark Mode) or export to Python's `NetworkX`.

---

## 🛠️ Drawing Tools

Create and annotate your topological structures with precision tools.

* 🔘 **Point:** Click the canvas to drop nodes.
* 📏 **Line:** Click two points to connect them sequentially.
* 〰️ **Curve:** Connect two points to draw a Bezier curve (adjustable offset).
* ♾️ **Loop:** Click a single point to draw a self-loop (adjustable angle and radius).
* ⭕ **Circle:** Click one point to create a boundary circle.
* 🌘 **Arc / Elliptic Arc:** Click to create open arcs or set foci for ellipses.
* 🔲 **Region:** Drag a box to draw a shaded, curved cluster background.
* 🔠 **Free Text:** Click anywhere to add free-floating LaTeX math text.

---

## 🖱️ Interactive Tools

Fluidly manipulate your workspace.

* 🖱️ **Select:** Click items to edit their properties. **Hold Shift** for multi-select.
* ➰ **Lasso:** Draw a freehand loop around items to select an entire subgraph at once.
* 🪣 **Paint Bucket:** Select a color from the toolbar and click items to instantly dye them.
* ✋ **Move:** Drag selected items, or click and drag empty space to pan the canvas.
* 🧽 **Eraser:** Click any item to instantly delete it (or select and press the `Delete` key).

---

## 🧠 Algorithmic & Physics Tools

Watch your graph think for itself.

* 🪄 **Magic Untangle (Auto-Layout):** Uses a force-directed spring physics algorithm to physically repel nodes and untangle messy, crossing edges into a symmetric layout.
* 🎨 **Auto-Color (Greedy Coloring):** Instantly estimates the chromatic number and dyes the graph using the minimum necessary colors, ensuring no adjacent nodes share the same color.
* 🔀 **Bipartite Snapper:** Runs a Breadth-First Search (BFS) to test if the graph is bipartite. If yes, it snaps nodes into two distinct, colored sets. If no, it traces and highlights the odd-length cycle in red.

---

## 🏗️ Macros & Generation

Stop drawing standard graphs by hand. Instantly generate common structures:
* **Complete ($K_n$) & Cycle ($C_n$)**
* **Path ($P_n$) & Star ($K_{1,n}$)**
* **Bipartite ($K_{m,n}$)**
* **Wheel ($W_n$)**
* **Lattice Grid ($m \times n$)**
* **3D Hypercube ($Q_3$)**

---

## 💾 Output & Export Options

Access the generated code from the right-hand panel.

1. **TikZ:** Native LaTeX formatting.
2. **PSTricks:** Node-based LaTeX formatting.
3. **Matrices:** Automatically maps your visual nodes to strictly formatted Adjacency ($A$), Degree ($D$), and Laplacian ($L$) `\bmatrix` environments.
4. **Python (NetworkX):** Outputs a ready-to-run Python script that recreates your exact graph and its visual `(x, y)` coordinate layout.
5. **Image:** Export a high-resolution, transparent PNG.
6. **Save/Load JSON:** Save your active workspace locally and pick up right where you left off.

## 📈 XY Plot Table

grafGen also supports simple XY plot tables for chart previewing and Matplotlib export.

The plot panel lets you choose a chart type, import CSV text, toggle grid and legend display, and export the same data to Matplotlib, PGFPlots, or Gnuplot.

Choose one of these modes in the plot panel:

* **One x column, many y series:** One shared x column with one or more y columns.

```text
x, y1, y2
0, 1, 2
1, 3, 4
2, 5, 8
```

* **Several x-y plots in one table:** Use x-y column pairs in the same table.

```text
x1, y1, x2, y2
0, 1, 0, 2
1, 3, 1, 4
2, 5, 2, 8
```

Use commas, spaces, or semicolons as separators, then click **Render Plot** to preview the chart and generate Matplotlib code.

Supported chart types include **line**, **scatter**, **bar**, and **step**.

TikZ and PSTricks exports deduplicate repeated node and edge styles so the generated LaTeX stays smaller and easier to edit.

---

## 🚀 Getting Started

grafGen is a purely client-side web application. No server, database, or installation is required.
1. Clone or download this repository.
2. Open `index.html` in any modern web browser.
3. Start drawing!

---

## 👨‍🔬 Author

**Juganta Rajkhowa**
