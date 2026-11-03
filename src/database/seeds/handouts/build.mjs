// Prints each handout (matematika.html, …) to an A4 PDF next to it, with real
// text so the PDF tutor can read it. Needs Playwright and network access for
// KaTeX and the font, e.g. from the nalar-be folder:
//
//   docker run --rm -v "$PWD/src/database/seeds/handouts:/h" \
//     mcr.microsoft.com/playwright:v1.49.1-noble sh -c \
//     "mkdir /b && cd /b && npm i --no-save playwright@1.49.1 >/dev/null && cp /h/build.mjs . && cd /h && node /b/build.mjs"
//
// The PDFs are committed; the core course seed uploads them as lesson resources.
import { readdirSync } from "node:fs";
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
for (const file of readdirSync(".").filter((name) => name.endsWith(".html"))) {
  await page.goto(`file://${process.cwd()}/${file}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.dataset.ready === "1");
  const title = await page.title();
  await page.pdf({
    path: file.replace(/\.html$/, ".pdf"),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font:7.5pt sans-serif;color:#8a8a8f;padding:0 16mm;display:flex;justify-content:space-between"><span>Bernalar · ${title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  console.log("printed", file);
}
await browser.close();
