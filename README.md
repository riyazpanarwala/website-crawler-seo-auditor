# website-crawler-seo-auditor
# 🕷️ Website Crawler & SEO Auditor

A powerful Node.js tool built with Playwright that automatically crawls your website, checks for SEO issues, broken links, image problems, and generates detailed reports.

## ✨ Features

- **🌐 Complete Website Crawling**: Automatically discovers and crawls all internal pages
- **🔍 SEO Analysis**: Checks meta titles, descriptions, and important meta tags
- **🖼️ Image Analysis**: Verifies image existence, alt text, and dimensions with duplicate prevention
- **🔗 Link Validation**: Identifies broken internal and external links
- **📄 Document Checking**: Verifies PDFs, images, and other document links
- **🚨 Error Detection**: Captures JavaScript errors and console warnings with intelligent filtering
- **📊 Comprehensive Reporting**: Generates HTML and JSON reports with detailed statistics
- **⚡ Performance Optimized**: Avoids duplicate checks for URLs and images
- **📸 Screenshot Capture**: Takes full-page screenshots of all pages
- **🔧 Customizable**: Easy to extend with new checks and validations

## 🚀 Quick Start

### Prerequisites

- Node.js 16 or higher
- npm or yarn

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/riyazpanarwala/website-crawler-seo-auditor.git
   cd website-crawler-seo-auditor

2. **Install dependencies:**:
   ```bash
   npm install

3. **Configure the target website:**:
    * Open crawler.js
    * Change the ROOT constant to your website URL:
    * const ROOT = "https://your-website.com";

4. **Run the crawler:**:
    ```bash
   npm start
