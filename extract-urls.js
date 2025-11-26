// extract-urls.js
import fs from 'fs';
import path from 'path';

// CONFIGURATION
const inputFile = 'site-report/report.json';     // Your report file
const outputFile = 'site-report/all_urls.txt';   // Where the URLs will be saved

function isImageOrPdf(url) {
  const lower = url.toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|ico|pdf)(\?.*)?$/.test(lower);
}

function extractCleanUrls() {
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: "${inputFile}" not found!`);
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const pages = data.pages || [];

    console.log(`Found ${pages.length} total entries.\n`);

    const cleanUrls = [];

    pages.forEach((page, index) => {
      const url = page.url?.trim();
      if (!url) return;

      if (isImageOrPdf(url)) {
        console.log(`Skipped (image/pdf): ${url}`);
      } else {
        cleanUrls.push(url);
        console.log(`${(cleanUrls.length).toString().padStart(3)}. ${url}`);
      }
    });

    // Save only clean URLs
    fs.writeFileSync(outputFile, cleanUrls.join('\n') + '\n', 'utf8');

    console.log('\n' + '='.repeat(70));
    console.log(`Done! ${cleanUrls.length} clean URLs (no images, no PDFs) saved to:`);
    console.log(`→ ${outputFile}`);
    console.log('='.repeat(70));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

extractCleanUrls();