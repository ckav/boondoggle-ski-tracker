# Boondoggle Ski Tracker

A mobile-first ski companion for a trip with friends. It records your runs on a map, shows lift status, helps you find the way back to the group, and keeps notes on trails as you go.

It's a static web app: there's no account and no server. Your tracks and notes are stored in your own browser.

The bundled resort data is for Morzine–Avoriaz in the Portes du Soleil, France.

## What it does

- **Map and tracking:** shows your position and route on an OpenTopoMap, detects runs, and works out speed and distance.
- **Lifts:** a status panel for each lift, with filters, wait times and vertical rise.
- **Best route home:** pick a destination and get a route based on your average speed.
- **Trail notes:** tap the map to add a note with quick tags.
- **Group:** create or join a group with a code, set your ability level, suggest a meetup point, plan the day, chat, and see a leaderboard of best runs.

## Current limitation

Group sharing uses the browser's `BroadcastChannel`, which only reaches other tabs on the same device. That means the group features work as a single-device demo. They won't sync between phones yet. Real sharing would need a backend or a peer-to-peer service.

## Running it locally

The app lives in `ski-tracker/`, so serve that folder with any static server, for example:

```bash
npx serve ski-tracker
```

Location access needs `localhost` or HTTPS, which browsers require for geolocation.

## Deploying

`netlify.toml` sets the build to publish `ski-tracker/` with no build command, so it deploys as a plain static site.

## Data

`ski-tracker/data/morzine-avoriaz.json` holds the resort centre, lifts and trails. The lift status and wait times in this version are sample values, not live data.

## Credits

- Map tiles © [OpenTopoMap](https://opentopomap.org) contributors
- Map built with [Leaflet](https://leafletjs.com)
