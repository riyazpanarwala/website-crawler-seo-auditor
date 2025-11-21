import { chromium } from "playwright";
import fs from "fs";

// 1. Change to your root website URL
const ROOT = "https://your-website.com";

// 2. Configuration - Report directories
const REPORT_CONFIG = {
  baseDir: "site-report",
  screenshotsDir: "site-report/screenshots",
  jsonReport: "site-report/report.json",
  htmlReport: "site-report/index.html"
};

const visited = new Set();
const queue = [ROOT];
const results = [];

// Document file extensions to check
const DOCUMENT_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
  '.mp4', '.avi', '.mov', '.wmv',
  '.zip', '.rar', '.7z',
  '.txt', '.rtf'
];

// Create report directories
fs.mkdirSync(REPORT_CONFIG.baseDir, { recursive: true });
fs.mkdirSync(REPORT_CONFIG.screenshotsDir, { recursive: true });

// Track already checked images globally to avoid duplicates
const checkedImages = new Map(); // Map<imageUrl, { exists: boolean, verified: boolean }>

// Normalize URL to avoid duplicates with different formats
function normalizeUrl(url) {
  try {
    const parsedUrl = new URL(url);
    // Remove trailing slashes, fragments, and normalize query parameters if needed
    let normalized = `${parsedUrl.origin}${parsedUrl.pathname}`;
    normalized = normalized.replace(/\/+$/, ''); // Remove trailing slashes
    
    // Optional: Remove common tracking parameters if you want to avoid duplicates
    // const searchParams = new URLSearchParams(parsedUrl.search);
    // ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'].forEach(param => {
    //   searchParams.delete(param);
    // });
    // if (searchParams.toString()) {
    //   normalized += `?${searchParams.toString()}`;
    // }
    
    return normalized;
  } catch {
    return url;
  }
}

// Normalize image URL (remove query parameters for better deduplication)
function normalizeImageUrl(url) {
  try {
    const parsedUrl = new URL(url);
    // For images, we often want to ignore query parameters as they might be cache busters
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return url;
  }
}

// Check if URL is a document
function isDocumentUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.toLowerCase();
    return DOCUMENT_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

// Enhanced error handling setup
function setupErrorHandling(page, pageResult) {
  // Initialize additional error categories
  pageResult.benignErrors = [];
  pageResult.networkErrors = [];
  pageResult.warnings = [];

  // Track page errors (JavaScript exceptions)
  page.on("pageerror", (err) => {
    const message = err.message;
    
    // Common benign errors to ignore
    const benignErrors = [
      /Syntax error, unrecognized expression:/,
      /jQuery\.expr/,
      /Script error\./,
      /Unable to preventDefault/,
      /Cannot read property/,
      /is not defined/,
      /null is not an object/,
      /undefined is not an object/,
    ];
    
    if (benignErrors.some(pattern => pattern.test(message))) {
      pageResult.benignErrors.push(message);
    } else {
      pageResult.jsErrors.push(message);
    }
  });

  // Track console errors
  page.on("console", (msg) => {
    const text = msg.text();
    const type = msg.type();
    
    if (type === "error") {
      const benignConsoleErrors = [
        /Syntax error, unrecognized expression:/,
        /Failed to load resource/,
        /Blocked a frame with origin/,
        /Content Security Policy/,
        /Loading failed for the/,
      ];
      
      if (benignConsoleErrors.some(pattern => pattern.test(text))) {
        pageResult.benignErrors.push(text);
      } else {
        pageResult.consoleErrors.push(text);
      }
    } else if (type === "warning") {
      pageResult.warnings.push(text);
    }
  });

  // Track network errors
  page.on("response", (response) => {
    if (response.status() >= 400) {
      pageResult.networkErrors.push(`${response.status()} - ${response.url()}`);
    }
  });
}

async function checkDocumentUrl(page, url, pageResult) {
  console.log(`📄 Checking document: ${url}`);
  
  const startTime = Date.now();
  try {
    const response = await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 15000 
    });
    
    pageResult.loadTime = Date.now() - startTime;
    pageResult.statusCode = response?.status() || 200;
    pageResult.isDocument = true;
    pageResult.documentType = url.split('.').pop()?.toUpperCase() || 'DOCUMENT';
    
    if (response?.status() >= 400) {
      pageResult.documentStatus = 'broken';
      pageResult.jsErrors.push(`Document returned status: ${response.status()}`);
    } else {
      pageResult.documentStatus = 'accessible';
      pageResult.title = `📄 ${pageResult.documentType} Document: ${url.split('/').pop()}`;
    }
    
    return true;
  } catch (err) {
    pageResult.loadTime = Date.now() - startTime;
    pageResult.documentStatus = 'broken';
    pageResult.jsErrors.push(`Failed to load document: ${err.message}`);
    return false;
  }
}

// Function to check if image exists by making a HEAD request
async function checkImageExists(page, imageUrl) {
  const normalizedImageUrl = normalizeImageUrl(imageUrl);
  
  // Check if we've already verified this image
  if (checkedImages.has(normalizedImageUrl)) {
    const existingCheck = checkedImages.get(normalizedImageUrl);
    console.log(`   🖼️  Using cached check for: ${imageUrl} -> ${existingCheck.exists ? 'EXISTS' : 'BROKEN'}`);
    return existingCheck.exists;
  }

  try {
    console.log(`   🖼️  Checking image: ${imageUrl}`);
    const response = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        return { status: response.status, ok: response.ok };
      } catch (error) {
        return { status: 0, ok: false, error: error.message };
      }
    }, imageUrl);
    
    const exists = response.ok && response.status === 200;
    
    // Cache the result
    checkedImages.set(normalizedImageUrl, { 
      exists, 
      verified: true,
      originalUrl: imageUrl,
      status: response.status
    });
    
    return exists;
  } catch {
    // Cache the failure
    checkedImages.set(normalizedImageUrl, { 
      exists: false, 
      verified: true,
      originalUrl: imageUrl,
      status: 0
    });
    return false;
  }
}

async function crawlAndTest() {
  const browser = await chromium.launch({ 
    headless: true,
    timeout: 60000 
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Set default timeouts
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);

  while (queue.length > 0) {
    const url = queue.shift();
    const normalizedUrl = normalizeUrl(url);
    
    // Check if this URL (or normalized version) has already been visited
    if (visited.has(normalizedUrl)) {
      console.log(`⏭️  Skipping already checked: ${url}`);
      continue;
    }
    
    visited.add(normalizedUrl);
    console.log(`\n🌐 Checking: ${url}`);

    const pageResult = {
      url,
      title: "",
      metaDescription: "",
      jsErrors: [],
      consoleErrors: [],
      brokenImages: [],
      allImages: [],
      imagesAnalysis: {
        total: 0,
        working: 0,
        broken: 0,
        withAlt: 0,
        withoutAlt: 0,
        details: []
      },
      links: [],
      statusCode: 200,
      loadTime: 0,
      metaTags: {},
      isDocument: false,
      documentType: "",
      documentStatus: ""
    };

    // Check if this is a document URL
    if (isDocumentUrl(url)) {
      await checkDocumentUrl(page, url, pageResult);
      results.push(pageResult);
      continue; // Skip HTML parsing for documents
    }

    // Setup enhanced error handling for HTML pages
    setupErrorHandling(page, pageResult);

    // Open page
    const startTime = Date.now();
    try {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      pageResult.loadTime = Date.now() - startTime;
      pageResult.statusCode = response?.status() || 200;
    } catch (err) {
      pageResult.jsErrors.push("Page failed to load: " + err.message);
      pageResult.loadTime = Date.now() - startTime;
      results.push(pageResult);
      continue;
    }

    // Title
    pageResult.title = await page.title();
    if (!pageResult.title) {
      pageResult.title = "⚠ Missing <title>";
    }

    // Meta Description and other important meta tags
    pageResult.metaDescription = await page.$eval('meta[name="description"]', (el) => el?.content || '').catch(() => '');
    
    // Check for other important meta tags
    try {
      pageResult.metaTags = await page.evaluate(() => {
        const metaTags = {};
        const importantMetaTags = [
          'description',
          'keywords',
          'viewport',
          'robots',
          'og:title',
          'og:description',
          'og:image',
          'twitter:title',
          'twitter:description',
          'twitter:image'
        ];
        
        const metaElements = document.querySelectorAll('meta');
        metaElements.forEach(meta => {
          const name = meta.getAttribute('name') || meta.getAttribute('property');
          if (name && importantMetaTags.includes(name)) {
            metaTags[name] = meta.getAttribute('content') || '';
          }
        });
        
        return metaTags;
      });
    } catch (error) {
      console.log(`⚠ Could not extract meta tags for ${url}`);
    }

    // Comprehensive image analysis
    try {
      pageResult.imagesAnalysis = await page.evaluate(async () => {
        const images = Array.from(document.querySelectorAll('img'));
        const analysis = {
          total: images.length,
          working: 0,
          broken: 0,
          withAlt: 0,
          withoutAlt: 0,
          details: []
        };

        for (const img of images) {
          const imageInfo = {
            src: img.src,
            alt: img.alt || '',
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            complete: img.complete,
            isWorking: false
          };

          // Check if image has alt text
          if (img.alt && img.alt.trim() !== '') {
            analysis.withAlt++;
          } else {
            analysis.withoutAlt++;
          }

          // Check if image is naturally loaded and has dimensions
          if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
            analysis.working++;
            imageInfo.isWorking = true;
          } else {
            analysis.broken++;
            imageInfo.isWorking = false;
          }

          analysis.details.push(imageInfo);
        }

        return analysis;
      });

      // Additional check: Verify images with HEAD requests (with duplicate prevention)
      console.log(`   📸 Found ${pageResult.imagesAnalysis.total} images, verifying...`);
      
      let duplicateChecks = 0;
      let newChecks = 0;
      
      for (const imageInfo of pageResult.imagesAnalysis.details) {
        if (imageInfo.src && !imageInfo.src.startsWith('data:')) {
          const normalizedImageUrl = normalizeImageUrl(imageInfo.src);
          
          // Check if we've already verified this image
          if (checkedImages.has(normalizedImageUrl)) {
            const existingCheck = checkedImages.get(normalizedImageUrl);
            imageInfo.verifiedExists = existingCheck.exists;
            imageInfo.cachedCheck = true;
            duplicateChecks++;
            
            if (!existingCheck.exists && imageInfo.isWorking) {
              // If cached check says broken but browser thinks it's working, mark as broken
              imageInfo.isWorking = false;
              pageResult.imagesAnalysis.working--;
              pageResult.imagesAnalysis.broken++;
            }
          } else {
            // New image, perform HEAD request
            const exists = await checkImageExists(page, imageInfo.src);
            imageInfo.verifiedExists = exists;
            imageInfo.cachedCheck = false;
            newChecks++;
            
            if (!exists && imageInfo.isWorking) {
              // If HEAD request fails but browser thinks it's working, mark as broken
              imageInfo.isWorking = false;
              pageResult.imagesAnalysis.working--;
              pageResult.imagesAnalysis.broken++;
            }
          }
        }
      }
      
      console.log(`   🖼️  Image checks: ${newChecks} new, ${duplicateChecks} cached`);

      // Update broken images list for backward compatibility
      pageResult.brokenImages = pageResult.imagesAnalysis.details
        .filter(img => !img.isWorking)
        .map(img => img.src);

    } catch (error) {
      console.log(`⚠ Could not analyze images for ${url}: ${error.message}`);
    }

    // Extract all links (both internal and document links)
    const allLinks = await page.$$eval("a[href]", (as, root) => {
      return as
        .map((a) => {
          try {
            return new URL(a.href, root).href;
          } catch {
            return null;
          }
        })
        .filter(href => href !== null);
    }, ROOT);

    // Separate internal HTML links from document links
    const internalLinks = [];
    const documentLinks = [];

    allLinks.forEach((link) => {
      const normalizedLink = normalizeUrl(link);
      
      if (isDocumentUrl(link)) {
        documentLinks.push(link);
      } else if (link.startsWith(ROOT)) {
        // Only add to queue if not already visited or queued
        if (!visited.has(normalizedLink) && !queue.some(q => normalizeUrl(q) === normalizedLink)) {
          internalLinks.push(link);
          queue.push(link);
          console.log(`   ➕ Added to queue: ${link}`);
        } else {
          console.log(`   ⏭️  Already in queue/visited: ${link}`);
        }
      }
    });

    // Track document links but don't add to queue (we'll check them separately)
    pageResult.links = internalLinks;
    pageResult.documentLinks = documentLinks;

    // Save Screenshot (only for HTML pages)
    try {
      const screenshotPath = `${REPORT_CONFIG.screenshotsDir}/${encodeURIComponent(normalizedUrl.replace(/[^a-zA-Z0-9]/g, '_'))}.png`;
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });
    } catch (screenshotError) {
      console.log(`⚠ Could not take screenshot for ${url}: ${screenshotError.message}`);
    }

    // Save result
    results.push(pageResult);
    
    // Small delay to be respectful to the server
    await page.waitForTimeout(1000);
  }

  await browser.close();
  generateReport();
}

// -----------------------------------------------------
// GENERATE HTML REPORT
// -----------------------------------------------------
function generateReport() {
  // Calculate summary statistics
  const totalPages = results.length;
  const htmlPages = results.filter(r => !r.isDocument);
  const documentPages = results.filter(r => r.isDocument);
  const pagesWithCriticalErrors = results.filter(r => 
    r.jsErrors.length > 0 || r.consoleErrors.length > 0
  ).length;
  const pagesWithBrokenImages = results.filter(r => r.brokenImages.length > 0).length;
  const pagesMissingTitles = htmlPages.filter(r => !r.title || r.title === "⚠ Missing <title>").length;
  const pagesMissingDescriptions = htmlPages.filter(r => !r.metaDescription).length;
  const brokenDocuments = documentPages.filter(r => r.documentStatus === 'broken').length;
  const totalCriticalErrors = results.reduce((sum, r) => sum + r.jsErrors.length + r.consoleErrors.length, 0);
  const totalBenignErrors = results.reduce((sum, r) => sum + r.benignErrors.length, 0);
  const totalBrokenImages = results.reduce((sum, r) => sum + r.brokenImages.length, 0);
  
  // Image statistics
  const totalImages = htmlPages.reduce((sum, r) => sum + (r.imagesAnalysis?.total || 0), 0);
  const totalWorkingImages = htmlPages.reduce((sum, r) => sum + (r.imagesAnalysis?.working || 0), 0);
  const totalBrokenImagesDetailed = htmlPages.reduce((sum, r) => sum + (r.imagesAnalysis?.broken || 0), 0);
  const imagesWithAlt = htmlPages.reduce((sum, r) => sum + (r.imagesAnalysis?.withAlt || 0), 0);
  const imagesWithoutAlt = htmlPages.reduce((sum, r) => sum + (r.imagesAnalysis?.withoutAlt || 0), 0);

  // Performance statistics
  const totalUniqueImagesChecked = checkedImages.size;
  const cachedImageChecks = Array.from(checkedImages.values()).filter(img => img.cached).length;

  let html = `
  <html>
  <head>
    <title>Website Test Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
      h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
      h2 { background: #f5f5f5; padding: 12px; border-left: 4px solid #007acc; margin-top: 30px; }
      h3 { color: #555; margin-top: 20px; }
      h4 { color: #666; margin: 15px 0 10px 0; }
      .error { color: #d32f2f; font-weight: bold; }
      .warn { color: #f57c00; }
      .ok { color: #388e3c; font-weight: bold; }
      .info { color: #1976d2; }
      .missing { color: #ff9800; font-weight: bold; }
      .document { color: #7b1fa2; }
      .summary { 
        background: #f8f9fa; 
        padding: 20px; 
        border-radius: 8px; 
        margin-bottom: 30px;
        border-left: 4px solid #007acc;
      }
      .summary-stats { 
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
        gap: 15px; 
        margin-top: 15px;
      }
      .stat-card {
        background: white;
        padding: 15px;
        border-radius: 6px;
        text-align: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .stat-number { 
        font-size: 24px; 
        font-weight: bold; 
        margin-bottom: 5px;
      }
      .page-section { 
        background: white; 
        padding: 20px; 
        margin: 20px 0; 
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .document-section {
        border-left: 4px solid #7b1fa2;
      }
      ul { 
        background: #f8f9fa; 
        padding: 15px; 
        border-radius: 6px; 
        margin: 10px 0;
      }
      li { 
        margin: 5px 0; 
        padding: 3px 0; 
        word-break: break-all;
      }
      .load-time { 
        background: #e3f2fd; 
        padding: 5px 10px; 
        border-radius: 4px; 
        display: inline-block;
        font-size: 14px;
      }
      .meta-tags {
        background: #f0f4f8;
        padding: 15px;
        border-radius: 6px;
        margin: 10px 0;
      }
      .meta-tag {
        display: flex;
        margin: 5px 0;
        padding: 3px 0;
      }
      .meta-tag-name {
        font-weight: bold;
        min-width: 150px;
        color: #555;
      }
      .meta-tag-value {
        flex: 1;
        word-break: break-word;
      }
      .document-status {
        padding: 8px 12px;
        border-radius: 4px;
        font-weight: bold;
        display: inline-block;
      }
      .document-accessible {
        background: #e8f5e8;
        color: #2e7d32;
      }
      .document-broken {
        background: #ffebee;
        color: #c62828;
      }
      .image-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
        margin: 10px 0;
      }
      .image-stat-card {
        background: #f8f9fa;
        padding: 10px;
        border-radius: 6px;
        text-align: center;
      }
      .image-details {
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 10px;
        background: #fafafa;
      }
      .image-item {
        padding: 8px;
        margin: 5px 0;
        border-left: 4px solid #388e3c;
        background: white;
        border-radius: 4px;
      }
      .image-item.broken {
        border-left-color: #d32f2f;
        background: #ffebee;
      }
      .image-item .src {
        font-weight: bold;
        word-break: break-all;
      }
      .image-item .alt {
        color: #666;
        font-style: italic;
      }
      .image-item .dimensions {
        color: #888;
        font-size: 0.9em;
      }
      .image-item .cache-info {
        color: #007acc;
        font-size: 0.8em;
        font-style: italic;
      }
    </style>
  </head>
  <body>
    <h1>📊 Full Website Automated Test Report</h1>
    
    <div class="summary">
      <h2>📈 Executive Summary</h2>
      <div class="summary-stats">
        <div class="stat-card">
          <div class="stat-number">${totalPages}</div>
          <div>Total URLs Checked</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${htmlPages.length}</div>
          <div>HTML Pages</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${documentPages.length}</div>
          <div>Documents</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" style="color: ${pagesWithCriticalErrors > 0 ? '#d32f2f' : '#388e3c'}">${pagesWithCriticalErrors}</div>
          <div>Pages with Errors</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" style="color: ${brokenDocuments > 0 ? '#d32f2f' : '#388e3c'}">${brokenDocuments}</div>
          <div>Broken Documents</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${totalImages}</div>
          <div>Total Images</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" style="color: ${totalBrokenImagesDetailed > 0 ? '#d32f2f' : '#388e3c'}">${totalBrokenImagesDetailed}</div>
          <div>Broken Images</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" style="color: ${imagesWithoutAlt > 0 ? '#f57c00' : '#388e3c'}">${imagesWithoutAlt}</div>
          <div>Images without Alt</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" style="color: #007acc">${totalUniqueImagesChecked}</div>
          <div>Unique Images Checked</div>
        </div>
      </div>
    </div>

    ${results
      .map((r) => {
        if (r.isDocument) {
          return `
            <div class="page-section document-section">
              <h2 class="document">📄 ${r.documentType} Document: ${r.url}</h2>
              <p><strong>Status:</strong> 
                <span class="document-status ${r.documentStatus === 'accessible' ? 'document-accessible' : 'document-broken'}">
                  ${r.documentStatus === 'accessible' ? '✅ ACCESSIBLE' : '❌ BROKEN'}
                </span>
              </p>
              <p><strong>Load Time:</strong> <span class="load-time">${r.loadTime}ms</span></p>
              <p><strong>HTTP Status:</strong> ${r.statusCode}</p>
              
              ${r.jsErrors.length > 0 ? `
                <h3>🚨 Document Issues</h3>
                <ul>${r.jsErrors.map((e) => `<li class="error">${e}</li>`).join("")}</ul>
              ` : ''}
            </div>
          `;
        }

        const hasMetaDescription = r.metaDescription && r.metaDescription.trim().length > 0;
        const descriptionLength = r.metaDescription ? r.metaDescription.length : 0;
        const descriptionStatus = !hasMetaDescription ? 'missing' : 
                                descriptionLength < 50 ? 'too-short' : 
                                descriptionLength > 160 ? 'too-long' : 'good';
        
        const imageAnalysis = r.imagesAnalysis || {};
        
        return `
          <div class="page-section">
            <h2>${r.url}</h2>
            <p><strong>Title:</strong> ${r.title} ${!r.title || r.title === "⚠ Missing <title>" ? '<span class="missing">(MISSING)</span>' : ''}</p>
            <p><strong>Load Time:</strong> <span class="load-time">${r.loadTime}ms</span></p>
            <p><strong>Screenshots:</strong> 
              <a href="screenshots/${encodeURIComponent(normalizeUrl(r.url).replace(/[^a-zA-Z0-9]/g, '_'))}.png" target="_blank">View Screenshot</a>
            </p>

            <h3>🖼️ Image Analysis (${imageAnalysis.total || 0} images)</h3>
            ${imageAnalysis.total > 0 ? `
              <div class="image-stats">
                <div class="image-stat-card">
                  <div class="stat-number" style="color: #388e3c">${imageAnalysis.working || 0}</div>
                  <div>Working</div>
                </div>
                <div class="image-stat-card">
                  <div class="stat-number" style="color: ${imageAnalysis.broken > 0 ? '#d32f2f' : '#388e3c'}">${imageAnalysis.broken || 0}</div>
                  <div>Broken</div>
                </div>
                <div class="image-stat-card">
                  <div class="stat-number" style="color: #388e3c">${imageAnalysis.withAlt || 0}</div>
                  <div>With Alt Text</div>
                </div>
                <div class="image-stat-card">
                  <div class="stat-number" style="color: ${imageAnalysis.withoutAlt > 0 ? '#f57c00' : '#388e3c'}">${imageAnalysis.withoutAlt || 0}</div>
                  <div>Without Alt Text</div>
                </div>
              </div>

              ${imageAnalysis.details && imageAnalysis.details.length > 0 ? `
                <h4>Image Details:</h4>
                <div class="image-details">
                  ${imageAnalysis.details.map(img => `
                    <div class="image-item ${img.isWorking ? '' : 'broken'}">
                      <div class="src">${img.src}</div>
                      ${img.alt ? `<div class="alt">Alt: "${img.alt}"</div>` : '<div class="alt missing">No alt text</div>'}
                      <div class="dimensions">Dimensions: ${img.naturalWidth}×${img.naturalHeight} | Status: ${img.isWorking ? '✅ Working' : '❌ Broken'}</div>
                      ${img.cachedCheck ? `<div class="cache-info">✓ Previously checked</div>` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            ` : '<p class="ok">No images found on this page ✔</p>'}

            <h3>📝 Meta Description</h3>
            <div class="meta-tags">
              <div class="meta-tag">
                <div class="meta-tag-name">Status:</div>
                <div class="meta-tag-value">
                  ${
                    !hasMetaDescription 
                      ? '<span class="missing">❌ MISSING - Meta description is required for SEO</span>'
                      : descriptionStatus === 'too-short'
                      ? `<span class="warn">⚠️ TOO SHORT (${descriptionLength} chars) - Recommended: 50-160 characters</span>`
                      : descriptionStatus === 'too-long'
                      ? `<span class="warn">⚠️ TOO LONG (${descriptionLength} chars) - Recommended: 50-160 characters</span>`
                      : `<span class="ok">✅ GOOD (${descriptionLength} characters)</span>`
                  }
                </div>
              </div>
              <div class="meta-tag">
                <div class="meta-tag-name">Content:</div>
                <div class="meta-tag-value">${hasMetaDescription ? r.metaDescription : '<em>No meta description found</em>'}</div>
              </div>
            </div>

            ${Object.keys(r.metaTags || {}).length > 0 ? `
            <h3>🔍 Other Important Meta Tags</h3>
            <div class="meta-tags">
              ${Object.entries(r.metaTags).map(([name, value]) => `
                <div class="meta-tag">
                  <div class="meta-tag-name">${name}:</div>
                  <div class="meta-tag-value">${value || '<em>empty</em>'}</div>
                </div>
              `).join('')}
            </div>
            ` : ''}

            ${r.documentLinks && r.documentLinks.length > 0 ? `
            <h3>📎 Document Links Found (${r.documentLinks.length})</h3>
            <ul>${r.documentLinks.map((l) => `<li class="info">${l}</li>`).join("")}</ul>
            ` : ''}

            <h3>🚨 Critical JavaScript Errors</h3>
            ${
              r.jsErrors.length
                ? `<ul>${r.jsErrors.map((e) => `<li class="error">${e}</li>`).join("")}</ul>`
                : '<p class="ok">No critical JS errors ✔</p>'
            }

            <h3>🚨 Critical Console Errors</h3>
            ${
              r.consoleErrors.length
                ? `<ul>${r.consoleErrors.map((e) => `<li class="error">${e}</li>`).join("")}</ul>`
                : '<p class="ok">No critical console errors ✔</p>'
            }

            <h3>⚠️ Benign Errors (Usually Safe to Ignore)</h3>
            ${
              r.benignErrors && r.benignErrors.length
                ? `<ul>${r.benignErrors.map((e) => `<li class="warn">${e}</li>`).join("")}</ul>`
                : '<p class="ok">No benign errors ✔</p>'
            }

            <h3>🌐 Network Issues</h3>
            ${
              r.networkErrors && r.networkErrors.length
                ? `<ul>${r.networkErrors.map((e) => `<li class="warn">${e}</li>`).join("")}</ul>`
                : '<p class="ok">No network errors ✔</p>'
            }

            <h3>🔗 Internal Links Found (${r.links.length})</h3>
            ${
              r.links.length
                ? `<ul>${r.links.map((l) => `<li class="info">${l}</li>`).join("")}</ul>`
                : '<p>No internal links found</p>'
            }
          </div>
        `;
      })
      .join("")}
  </body>
  </html>
  `;

  fs.writeFileSync(REPORT_CONFIG.htmlReport, html);
  
  // Also generate a JSON report for programmatic use
  fs.writeFileSync(
    REPORT_CONFIG.jsonReport, 
    JSON.stringify({
      summary: {
        totalPages,
        htmlPages: htmlPages.length,
        documentPages: documentPages.length,
        pagesWithCriticalErrors,
        brokenDocuments,
        pagesMissingTitles,
        pagesMissingDescriptions,
        pagesWithBrokenImages,
        totalCriticalErrors,
        totalBenignErrors,
        totalBrokenImages,
        images: {
          total: totalImages,
          working: totalWorkingImages,
          broken: totalBrokenImagesDetailed,
          withAlt: imagesWithAlt,
          withoutAlt: imagesWithoutAlt,
          uniqueImagesChecked: totalUniqueImagesChecked
        }
      },
      pages: results
    }, null, 2)
  );
  
  console.log(`\n📄 Report generated: ${REPORT_CONFIG.htmlReport}`);
  console.log(`📊 JSON data: ${REPORT_CONFIG.jsonReport}`);
  console.log(`📸 Screenshots: ${REPORT_CONFIG.screenshotsDir}`);
  console.log(`\n📈 Summary:`);
  console.log(`   Total URLs checked: ${totalPages}`);
  console.log(`   HTML pages: ${htmlPages.length}`);
  console.log(`   Documents: ${documentPages.length}`);
  console.log(`   Pages with critical errors: ${pagesWithCriticalErrors}`);
  console.log(`   Broken documents: ${brokenDocuments}`);
  console.log(`   Pages missing titles: ${pagesMissingTitles}`);
  console.log(`   Pages missing descriptions: ${pagesMissingDescriptions}`);
  console.log(`   Total critical errors: ${totalCriticalErrors}`);
  console.log(`   Total broken images: ${totalBrokenImages}`);
  console.log(`\n🖼️  Image Analysis:`);
  console.log(`   Total images: ${totalImages}`);
  console.log(`   Working images: ${totalWorkingImages}`);
  console.log(`   Broken images: ${totalBrokenImagesDetailed}`);
  console.log(`   Images with alt text: ${imagesWithAlt}`);
  console.log(`   Images without alt text: ${imagesWithoutAlt}`);
  console.log(`   Unique images checked: ${totalUniqueImagesChecked}`);
  console.log(`   Performance: Avoided ${totalImages - totalUniqueImagesChecked} duplicate image checks`);
}

// Start the crawling process
crawlAndTest().catch(console.error);