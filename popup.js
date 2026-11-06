async function openViewer() {
  const status = document.querySelector("#status");
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url && new URL(tab.url);
    if (!url || url.protocol !== "https:" || !/(^|\.)pinterest\.(com|ca|de|fr|it|es|jp|co\.uk|com\.au|com\.br|co\.kr|com\.mx|co\.nz|at|ch|nl|pt|se|dk|ie|ph|ru|cl|co)$/i.test(url.hostname)) {
      status.textContent = "Open a Pinterest page, then click PintViewer again.";
      return;
    }

    const [injection] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["viewer.js"],
    });
    if (injection?.result === "opened") {
      window.close();
      return;
    }

    status.textContent = injection?.result === "empty"
      ? "No photos found yet. Scroll the Pinterest page and try again."
      : "Couldn’t open the viewer. Reload the Pinterest page and try again.";
  } catch (error) {
    console.error("PintViewer", error);
    status.textContent = "Couldn’t open the viewer. Reload the Pinterest page and try again.";
  }
}

openViewer();
