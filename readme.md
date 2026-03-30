# Auto-Scraper Tool: Quick Start Guide

## 1. Overview

This repository utilizes the Gemini AI to automate the extraction of CSS selectors and parsing logic for web scrapers.

**How it works:** The tool reads local HTML fixtures you provide, analyzes the DOM, and automatically injects the correct scraping logic into your vendor's boilerplate templates (based on the `example.com` structure).

**Security & Privacy:** Because Gemini only reads the specific HTML files you feed it, **your main project's source code remains 100% secure and private.** *Note: The accuracy of the generated code depends entirely on the quality of the HTML investigation and preparation.*

## 2. Setup

Clone this tool into your workspace (ideally in the same parent directory as your main project repo) and install the dependencies.

**Bash**

```
# Clone the repository
git clone <repository_url> auto-scraper-tool
cd auto-scraper-tool

# Install required packages
npm install
```

## 3. Preparation (In A2B Project)

Before running the AI, you must prepare the target vendor's files in your **Main Project Repo** (e.g., `a2b_ext_chrome`).

1. **Scaffold the Elements:** Run `npm run new` to generate the base element `.js` files for your target vendor.
2. **Download HTML Fixtures:** Save the HTML files of the product pages into the vendor's `fixtures` folder.

   * *Pro Tip:* Keep the HTML as clean as possible to save tokens and improve AI focus (e.g., run a script to remove heavy `<script>` or `<svg>` tags before saving).
3. **Configure `url.yml` (CRITICAL):** Map each HTML fixture to a specific state using comments. The AI relies heavily on these descriptions to understand edge cases.
   **Format Requirement:** You MUST use the `# caseX - description` format.
   *Example `url.yml`:*
   **YAML**

   ```
   root:
     - url: 'https://www.hobbystock.jp/item/view/hby-ccg-00307061' # case1 - Product in stock
     - url: 'https://www.hobbystock.jp/item/view/hby-ccg-00035191' # case2 - Product out of stock
   ```

   *💡 Recommendation: Always include SP (Smartphone) HTML cases and define them in the `url.yml` (e.g., `# case3 - Product in stock SP mode`). This allows Gemini to generate cross-platform selectors effectively. If you see the HTML of PC mode is similar to SP mode (or almost similar) you can skip provide it*

## 4. Execution

Once the fixtures and `url.yml` are ready, return to the **Auto-Scraper Tool directory** and run the script.

**Syntax:**

**Bash**

```
node auto-scraper.js <relative_path_to_main_project> <vendor_name>
```

**Example:**

**Bash**

```
node auto-scraper.js ../a2b_ext_chrome www.viviennewestwood.com
```

Sit back and wait for a few seconds. The script will bundle the HTML, send it to Gemini, and inject the returned logic directly into your main project's `.js` files.

## 5. Verification & Testing

Once the script finishes:

1. Open the generated files in your main project.
2. **Review the code:** Always verify the generated selectors and JavaScript logic.
3. **Remember:** *"Gemini is an AI and can make mistakes."* It is highly recommended to run your scraper's test suite to ensure the AI-generated code handles all edge cases perfectly.
