# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository-local Git hooks and nutrition-aware validation tooling.

## [3.1.0] - 2026-07-27

### Added

- Adult profile validation and a one-time migration for the reviewed profile.
- Macro consistency warnings for user-created foods.
- Evidence-based guidance for hypotension, hydration, knee rehabilitation, and supplements.
- Contributor and health-review handoff documentation.

### Changed

- Rebalanced default meals around a 2,550–2,650 kcal reviewed target.
- Based fat-loss protein targets on goal weight.
- Replaced fixed water, step, workout-burn, meal-timing, and diet-break claims with individualized guidance.
- Updated the displayed app version to 3.1.

### Fixed

- Prevented exercise calories from being counted twice.
- Clamped generated calorie targets to the setup validation floor.
- Aligned food-reference calories with their displayed portions and macros.
- Applied consistent bounds and ordering checks to editable profile targets.

### Security

- Restricted automated profile guidance to adults and rejected unsafe goal-weight ranges.
