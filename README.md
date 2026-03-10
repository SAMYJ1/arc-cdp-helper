# arc-cdp-helper

Small Playwright helpers for controlling Arc Browser through its Chromium CDP endpoint.

## What it does

This repo connects to an already-running Arc instance via CDP, then lets you:

- list tabs
- open URLs
- click elements by CSS selector
- click visible text
- type into inputs
- press keyboard keys
- evaluate JavaScript in the page
- take screenshots
- wait for URL changes
- wait for newly opened pages

## Requirements

- Arc Browser running with a CDP endpoint exposed
- Node.js
- Playwright

Default CDP endpoint used by the scripts:

```bash
http://127.0.0.1:9222
```

You can override it with `ARC_CDP_URL`.

## Install

```bash
npm install
```

## Usage

### List tabs

```bash
npm run arc:tabs
```

### Open a URL

```bash
npm run arc:open -- --url "https://example.com"
```

### Click by selector

```bash
npm run arc:click -- --title "Some Page" --selector "button[type=submit]"
```

### Click by visible text

```bash
npm run arc:click-text -- --title "Some Page" --text "Continue"
```

### Type into an input

```bash
npm run arc:type -- --title "Sign in" --selector "input[type=email]" --text "name@example.com"
```

### Press a key

```bash
npm run arc:press -- --title "Sign in" --key Enter
```

### Evaluate JS

```bash
npm run arc:eval -- --title "Some Page" --js "document.title"
```

### Screenshot

```bash
npm run arc:screenshot -- --title "Some Page" --path /tmp/page.png
```

### Wait for navigation

```bash
npm run arc:wait-url -- --title "Some Page" --url-match "github.com/new"
```

### Wait for new tab/page

```bash
npm run arc:wait-new-page -- --timeout 20000
```

## Notes

- Arc is Chromium-based, so Playwright `connectOverCDP` works when remote debugging is enabled.
- Some websites change DOM structure often; in those cases, prefer `click-text` or add page-specific scripts.
- This helper is intentionally small and scriptable rather than framework-heavy.
