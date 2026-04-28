# Adding a game to Harbour

To ensure that all PC ports included in Harbour Ports are easy for the community to play, there are a few guidelines to meet when submitting a port to Harbour.

## Port Requirements
- [ ] The port must be in an open-source repository (Github, GitLab) and actively maintained
- [ ] The port **must not** redistribute any copyrighted assets.  Ports found to have ROMs embedded will be removed from the database immediately.
- [ ] The port must provide a clean installer or archive (`.zip`, `.tar.gz`, `.7z`).  Harbour will not accept ports that require compiling from source.

## JSON Manifest Requirements
- [ ] An entry must strictly follow the structure of the [Harbour-entry]() JSON.
- [ ] Download URLs must link directly to a download (such as Github Releases), not an external landing page.

## Display
- [ ] While not required, a thumbnail image for menus is strongly recommended.  Preferred resolutions are 256x256 or 512x512, in `.png` or `.jpg` format.