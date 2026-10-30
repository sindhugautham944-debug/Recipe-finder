# Good Measure

A responsive, browser-based recipe finder and meal planner built with plain HTML, CSS, and JavaScript. Recipe data and personal settings stay in the browser; there is no account or custom backend.

## Run locally

The recipe collection is loaded from `data/recipes.json`, so serve the project over HTTP instead of opening `index.html` directly. With Python installed, run this from the project folder:

```powershell
py -m http.server 8000
```

Then open <http://localhost:8000>.

## Project layout

- `index.html` and `css/styles.css` define the responsive app shell and interface.
- `js/app.js` handles routing, recipe search, favorites, planning, shopping lists, preferences, and data import/export.
- `data/recipes.json` is the bundled recipe collection. Each recipe includes ingredients, steps, tags, and serving information.
- `privacy.html` explains local storage and dietary-label limitations.

## Data and privacy

Favorites, meal plans, grocery items, and preferences are stored in this browser's local storage. Use Settings to export or import a JSON backup, or clear saved data. Dietary labels are informational; always verify ingredient packaging for allergens.

## Deploy

The project is static and can be hosted on GitHub Pages or another static host. For GitHub Pages, push the project to a repository, then enable Pages in the repository settings and select the `main` branch and root folder. The app does not require a build step.