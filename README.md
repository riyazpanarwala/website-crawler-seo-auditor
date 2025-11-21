# 🕷️ Website Crawler & SEO Auditor

A powerful **Node.js + Playwright** based tool that automatically
**crawls your entire website**, checks SEO issues, validates links,
analyzes images, captures screenshots, and generates complete audit
reports.

## ✨ Features

### 🌐 Complete Website Crawling

-   Automatically discovers **all internal pages**
-   Crawls every reachable HTML page (20--30+ pages)
-   Prevents duplicate scans using a `visited` set

### 🔍 SEO Analysis

-   Validates:
    -   `<title>`
    -   `<meta name="description">`
    -   `<meta name="keywords">`
-   Detects missing, empty, or duplicate SEO tags

### 🖼️ Image Analysis

-   Reports:
    -   Broken images
    -   Missing `alt` attributes
    -   Empty `alt` attributes
-   Avoids duplicate image checks for speed

### 🔗 Link Validation

-   Checks:
    -   Internal links
    -   External links
    -   PDF/document links
-   Detects:
    -   404/500 broken links
    -   Redirect chains
    -   Empty or invalid href values

### 📄 Document Checking

-   Verifies:
    -   PDFs
    -   Images
    -   ZIP files
    -   Any external assets
-   Reports broken or unreachable documents

### 🚨 Error Detection

-   Captures:
    -   JavaScript errors
    -   Console errors/warnings
-   Filters out noise and detects real issues

### 📸 Screenshot Capture

-   Captures full-page screenshots for **every page**
-   Stores them inside `/screenshots/`

### 📊 Comprehensive Reporting

Automatically generates:

  File                    Description
  ----------------------- -------------------------------
  `/report/report.json`   Machine-readable audit output
  `/report/report.html`   Clean human-readable report

Contains: - Total pages scanned\
- Broken links\
- Image problems\
- SEO issues\
- JavaScript errors\
- Crawl map\
- Page-wise summary

### ⚡ Performance Optimized

-   Uses BFS crawling
-   Avoids repeated checks
-   Caches processed URLs, images & documents

## 🚀 Quick Start

### Prerequisites

Make sure you have:

-   **Node.js 16+**
-   **npm** or **yarn**

## 📦 Installation

### 1. Clone the Repository

``` bash
git clone https://github.com/riyazpanarwala/website-crawler-seo-auditor.git
cd website-crawler-seo-auditor
```

### 2. Install Dependencies

``` bash
npm install
```

### 3. Configure Your Target Website

Open **crawler.js** and set your website root URL:

``` js
const ROOT = "https://your-website.com";
```

### 4. Run the Crawler

``` bash
npm start
```

This will:

-   Crawl all pages\
-   Validate links\
-   Check SEO\
-   Analyze images\
-   Capture screenshots\
-   Generate reports

## 📁 Output Structure

After running, you'll see:

    /screenshots/          → All page screenshots
    /report/
        report.json        → JSON audit data
        report.html        → Full HTML report

## 🤝 Contributing

Contributions are welcome!\
You can add:

-   More SEO checks\
-   Accessibility checks\
-   More report sections\
-   CI/CD integration

Just open a pull request.
