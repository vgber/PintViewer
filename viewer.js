(() => {
  if (globalThis.pintViewerDialog) return "opened";

  const seen = new Set();
  const pending = [];

  function collectPhotos() {
    let firstPinImage;
    for (const img of document.images) {
      if (!img.getClientRects().length) continue;

      const pinLink = img.closest('a[href*="/pin/"]');
      const pin = img.closest('[data-test-id="pin"], [data-test-id="pinWrapper"]') || pinLink;
      if (pin?.querySelector("video")) continue;

      // Pinterest usually supplies multiple widths of the same image.
      const candidates = img.srcset.split(",").map((entry) => {
        const [url, width] = entry.trim().split(/\s+/);
        return { url, width: parseFloat(width) || 0 };
      }).sort((a, b) => b.width - a.width).map(({ url }) => url);
      candidates.push(img.currentSrc, img.src);

      const sources = [];
      for (const candidate of candidates) {
        if (!candidate || !URL.canParse(candidate, document.baseURI)) continue;
        const url = new URL(candidate, document.baseURI);
        if (url.protocol === "https:" && url.hostname === "i.pinimg.com"
            && /^\/(?:\d+x\d*|originals)\//.test(url.pathname)) {
          sources.push(url);
        }
      }
      if (!sources.length) continue;

      // Large Pinterest CDN images also cover pin detail pages without a pin link.
      const bounds = img.getBoundingClientRect();
      if (bounds.width < 100 || bounds.height < 100) continue;

      const key = sources[0].pathname.split("/").slice(2).join("/");
      if (!seen.has(key)) {
        seen.add(key);
        if (!firstPinImage && pin) firstPinImage = img;
        pending.push({
          sources: [...new Set(sources.map((url) => url.href))],
          alt: img.alt.trim(),
        });
      }
    }
    return firstPinImage;
  }

  const firstPinImage = collectPhotos();
  if (!pending.length) return "empty";
  const gallery = pending.splice(0);

  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  const styles = new CSSStyleSheet();
  styles.replaceSync(`
    dialog {
      position: fixed;
      inset: 0;
      margin: 0;
      border: 0;
      padding: 0;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      background: #131419;
      color: #fff;
      font: 16px system-ui, sans-serif;
    }
    .viewer {
      height: 100%;
      box-sizing: border-box;
      padding: 16px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 12px;
    }
    header, footer { display: flex; align-items: center; gap: 12px; }
    header { justify-content: space-between; }
    footer { flex-direction: column; gap: 8px; }
    nav { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; }
    .feedback { margin: 0; font-size: 14px; }
    .stage { display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; min-width: 0; text-align: center; }
    img { width: 100%; height: 100%; min-height: 0; object-fit: contain; }
    button {
      font: inherit;
      color: inherit;
      background: #30323c;
      border: 1px solid #686b79;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
    }
    button:disabled, button[aria-disabled="true"] { opacity: .5; cursor: default; }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
    .counter { text-align: center; min-width: 7ch; font-variant-numeric: tabular-nums; }
    [hidden] { display: none !important; }
  `);
  shadow.adoptedStyleSheets = [styles];
  shadow.innerHTML = `
    <dialog aria-label="PintViewer">
      <div class="viewer">
        <header><strong>PintViewer</strong><button type="button" autofocus>Close</button></header>
        <div class="stage"><span role="status"></span></div>
        <footer>
          <nav aria-label="Photo controls">
            <button type="button">← Previous</button>
            <span class="counter" aria-live="polite"></span>
            <button type="button">Next →</button>
            <button type="button">Load 10 more</button>
          </nav>
          <p class="feedback" role="status" hidden></p>
        </footer>
      </div>
    </dialog>
  `;

  const dialog = shadow.querySelector("dialog");
  const [close, previous, next, loadMore] = shadow.querySelectorAll("button");
  const feedback = shadow.querySelector(".feedback");
  const counter = shadow.querySelector(".counter");
  const stage = shadow.querySelector(".stage");
  const status = stage.querySelector("span");
  let index = 0;
  let photoElement;

  function updateControls() {
    counter.textContent = `${index + 1} / ${gallery.length}`;
    previous.disabled = index === 0;
    next.disabled = index === gallery.length - 1;
    if (shadow.activeElement === loadMore && !next.disabled) next.focus();
    loadMore.hidden = !next.disabled;
    if (shadow.activeElement === previous && previous.disabled) {
      (next.disabled ? close : next).focus();
    } else if (shadow.activeElement === next && next.disabled) {
      loadMore.focus();
    }
  }

  function render() {
    const photo = gallery[index];
    updateControls();
    photoElement?.remove();
    const image = document.createElement("img");
    photoElement = image;
    image.alt = photo.alt || `Pinterest photo ${index + 1}`;
    image.hidden = true;
    status.hidden = false;
    status.textContent = "Loading photo…";
    let source = 0;
    image.onload = () => {
      if (photoElement !== image) return;
      status.hidden = true;
      image.hidden = false;
    };
    image.onerror = () => {
      if (photoElement !== image) return;
      source += 1;
      if (source < photo.sources.length) {
        image.src = photo.sources[source];
      } else {
        status.textContent = "This photo couldn’t load.";
      }
    };
    stage.append(image);
    image.src = photo.sources[source];
  }

  function move(offset) {
    const target = index + offset;
    if (target < 0 || target >= gallery.length) return;
    index = target;
    if (!loadTimer) showFeedback("");
    render();
  }

  const originalFocus = document.activeElement;
  const scrollRoot = document.scrollingElement;
  const previousOverflow = scrollRoot?.style.getPropertyValue("overflow");
  const previousPriority = scrollRoot?.style.getPropertyPriority("overflow");
  let feedScroller = scrollRoot;
  for (let parent = firstPinImage?.parentElement; parent && parent !== scrollRoot;
    parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (/^(auto|scroll)$/.test(overflowY) && parent.scrollHeight > parent.clientHeight) {
      feedScroller = parent;
      break;
    }
  }

  const pageUrl = location.href;
  const initialScroll = feedScroller.scrollTop;
  let loadTimer = 0;

  function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = !message;
  }

  function loadBatch() {
    if (loadTimer) return;
    const batchSize = 10;
    const deadline = Date.now() + 6500;
    loadMore.setAttribute("aria-disabled", "true");
    showFeedback("Loading more Pinterest photos…");

    function checkFeed() {
      if (!dialog.open || location.href !== pageUrl) {
        loadTimer = 0;
        if (dialog.open) dialog.close();
        return;
      }

      collectPhotos();
      if (pending.length >= batchSize || Date.now() >= deadline || !feedScroller.isConnected) {
        loadTimer = 0;
        loadMore.removeAttribute("aria-disabled");
        const additions = pending.splice(0, batchSize);
        gallery.push(...additions);
        const count = additions.length;
        updateControls();
        showFeedback(count ? `Added ${count} ${count === 1 ? "photo" : "photos"}.`
          : "No new photos loaded. Try again in a moment.");
        return;
      }

      // Move about one screen at a time so Pinterest can render intervening pins.
      feedScroller.scrollBy({ top: Math.max(1, feedScroller.clientHeight * 0.85),
        behavior: "instant" });
      loadTimer = window.setTimeout(checkFeed, 550);
    }

    checkFeed();
  }

  const keyboard = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!["ArrowLeft", "ArrowRight", "Escape"].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") dialog.close();
    else move(event.key === "ArrowLeft" ? -1 : 1);
  };

  close.addEventListener("click", () => dialog.close());
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  loadMore.addEventListener("click", loadBatch);
  dialog.addEventListener("close", () => {
    window.removeEventListener("keydown", keyboard, true);
    window.clearTimeout(loadTimer);
    scrollRoot?.style.setProperty("overflow", previousOverflow, previousPriority);
    if (location.href === pageUrl && feedScroller.isConnected && feedScroller.scrollTop !== initialScroll) {
      feedScroller.scrollTo({ top: initialScroll, behavior: "instant" });
    }
    host.remove();
    delete globalThis.pintViewerDialog;
    originalFocus?.focus({ preventScroll: true });
  }, { once: true });

  document.body.append(host);
  dialog.showModal();
  globalThis.pintViewerDialog = dialog;
  scrollRoot?.style.setProperty("overflow", "hidden", "important");
  window.addEventListener("keydown", keyboard, true);
  render();
  return "opened";
})();
