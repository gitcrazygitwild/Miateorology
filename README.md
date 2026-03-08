# Mia-teorology 🐱🌦

A weather forecast comparison and accuracy tracker.

The site compares forecasts from multiple sources and tracks how accurate they are over time, with Richmond, VA as the default location.

## Features

- Daily forecast accuracy leaderboard
- Forecast comparison between:
  - NWS (National Weather Service)
  - Open-Meteo
  - MET Norway
- Blended forecast combining all sources
- Hourly and daily blended forecasts
- 1-year historical accuracy backfill for Open-Meteo
- Toggle between live accuracy and historical analysis

## How it works

Every day a GitHub Action:

1. Collects forecasts from multiple weather APIs
2. Saves a snapshot of the predictions
3. Pulls observed weather data
4. Scores each forecast based on error
5. Updates the leaderboard

The site then displays this data using static JSON files.

## Project Structure
