# Changelog

All notable changes to Export Selected Layers for Photopea are recorded here.
The project follows [Semantic Versioning](https://semver.org/).

## [1.0.12] - 2026-07-27

### Added

- Display the current plugin version clearly on the public installer page.
- Show the tested Photopea release and scripting version inside the Photopea
  panel and on the installer page.
- Add a compatibility table to the README.
- Start this maintained changelog.

## [1.0.11] - 2026-07-27

### Changed

- Export through an external PSD snapshot instead of duplicating and modifying
  the original workfile.
- Open a fresh independent temporary document for each selected layer.
- Keep the original workfile and its History unchanged during export.

## [1.0.10] - 2026-07-27

### Changed

- Make temporary-document creation, rendering, export, cleanup, and source
  restoration one coordinated export lifecycle.
- Bake Smart Filters in the temporary copy before encoding.

## [1.0.9] - 2026-07-27

### Fixed

- Handle cleanup confirmation and Photopea's generic `done` message in either
  order.
- Verify that the temporary tab closes and the original workfile is restored.

## [1.0.8] - 2026-07-27

### Fixed

- Identify temporary documents by a unique private name.
- Close only the matching temporary document instead of whichever document is
  active.

## [1.0.7] - 2026-07-27

### Fixed

- Read a duplicated document from `app.activeDocument`, matching Photopea's
  behavior when `Document.duplicate()` returns `null`.
- Follow Photopea's documented `ArrayBuffer` then `done` response sequence.

## [1.0.6] - 2026-07-27

### Fixed

- Wait for Photopea to return the exported image before closing the temporary
  document.
- Remove the plugin's obsolete custom completion marker.

## [1.0.5] - 2026-07-27

### Added

- Show the plugin version as a badge in the Photopea panel.

## [1.0.4] - 2026-07-27

### Fixed

- Accept exported binary data without depending on a separate filename message.
- Ignore stale selection responses and report a timeout instead of loading
  indefinitely.

## [1.0.3] - 2026-07-27

### Fixed

- Restore remembered folder access in a top-level picker window, where browsers
  allow permission requests.
- Add cache-busted plugin assets.

## [1.0.0] - 2026-07-27

### Added

- Initial public release.
- Export selected layers and groups as PNG, JPG, or WEBP.
- Direct-folder export with remembered folder access.
- ZIP download fallback, transparent-bound trimming, safe filenames, and
  duplicate-name protection.
