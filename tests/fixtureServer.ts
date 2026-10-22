import { resolve } from "node:path";

const html = `<!doctype html><html lang="en"><head><title>CT local test fixture</title></head><body>
<button data-ct="building-open">Open private building</button><div id="blank">Background</div>
<input aria-label="Private input" value="secret"><div data-ct-ignore><button>Ignored button</button></div>
<svg width="100" height="100"><rect width="100" height="100" data-ct="svg-building"/></svg><div id="shadow"></div>
<script type="module">
import {createTracker} from '/client.js';
// This local-only fixture deliberately models a human; production code has no bypass.
if (new URL(location.href).searchParams.has('human')) Object.defineProperty(navigator, 'webdriver', {get: () => false});
const root = document.querySelector('#shadow').attachShadow({mode:'open'});
root.innerHTML='<button data-ct="shadow-building">Shadow building</button>';
window.tracker=createTracker({site:'skyline',capture:'all',page:()=>'/test/:route',endpoint:'http://127.0.0.1:4175/v1/clicks',flushIntervalMs:1000,overrideGpc:new URL(location.href).searchParams.get('overrideGpc')==='true'});
window.ready=true;
const probe = new URL(location.href).searchParams.get('probe');
if (probe) {
  for (let i=0; i<40 && !document.documentElement.hasAttribute('data-ct-disabled'); i++) await new Promise(resolve=>setTimeout(resolve,100));
  await fetch('/probe-result?id='+encodeURIComponent(probe), {method:'POST',body:JSON.stringify({marked:document.documentElement.hasAttribute('data-ct-disabled'),initialized:window.tracker.init()})});
}
</script></body></html>`;
const probes = new Map<string, unknown>();
Bun.serve({
  hostname: "127.0.0.1",
  port: 4174,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/probe-result") {
      const id = url.searchParams.get("id") ?? "";
      if (request.method === "POST") probes.set(id, await request.json());
      return Response.json(probes.get(id) ?? null);
    }
    if (new URL(request.url).pathname === "/client.js")
      return new Response(
        Bun.file(resolve(import.meta.dir, "../packages/client/dist/index.js")),
        { headers: { "Content-Type": "application/javascript" } },
      );
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  },
});
