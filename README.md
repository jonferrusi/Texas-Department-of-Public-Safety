# Texas Department of Public Safety — ER:LC Roleplay

A single-page website for the Texas Department of Public Safety roleplay division on Emergency Response: Liberty County (ER:LC).

## Structure

```
index.html        Page markup
css/styles.css     Theme, layout, animations
js/main.js         Nav behavior, scroll effects, starfield canvas, card interactions
assets/            Department seal + favicons
```

## Local preview

Any static file server works, e.g.:

```
python3 -m http.server 8080
```

then open http://localhost:8080.

## Deploying

This is a static site with no build step — it can be hosted as-is on GitHub Pages, Netlify, Vercel, or similar. Point the host at the repository root (`index.html`).

## Notes

- This is an unofficial fan/roleplay site, not affiliated with the real Texas Department of Public Safety or the State of Texas (see footer disclaimer).
- Update the Application, Support, and Department Updates links in `index.html` (they also appear in the footer) if those URLs change.
