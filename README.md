# PintViewer

PintViewer is a Firefox extension for viewing Pinterest photos one at a time.

## Try it in Firefox

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and select this folder's `manifest.json`.
3. Open a Pinterest page and click **PintViewer** in the toolbar or Extensions menu.
4. Use **Previous** and **Next** or the left and right arrow keys. Press **Escape** or click **Close** to return to Pinterest.

PintViewer collects photos that the page has already loaded when the viewer opens. To include more from a feed, close the viewer, scroll down to load more pins, and reopen it.

Firefox removes temporary add-ons when it restarts. While developing, click **Reload** beside PintViewer on the debugging page after editing its files.
