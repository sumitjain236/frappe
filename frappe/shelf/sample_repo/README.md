# GST & Compliance shelf

A sample Shelf repository. Every folder under `artifacts/` is one installable artifact.
`index.json` is generated; do not edit it by hand. See `SHELF_FORMAT.md` in the store app for the format.

Contributing: add or change an artifact folder, run `python scripts/build_index.py .`, open a pull request.
The `shelf-index` workflow rebuilds `index.json` on every push to `main`.
