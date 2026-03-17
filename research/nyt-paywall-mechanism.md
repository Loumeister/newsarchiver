# New York Times content-hiding mechanism reconnaissance

Date: 2026-03-17
Target URL tested: `https://www.nytimes.com/2024/05/30/technology/openai-nyt-lawsuit.html`

## Scope and lawful framing
This note documents **observable rendering gates** encountered during legitimate browser-style loading for archival reliability work. It does **not** include exploit steps.

## Evidence log

### 1) Browser automation receives anti-bot interstitial instead of article markup
**Observed**
- Playwright (`chromium`) loads a DataDome CAPTCHA interstitial page.
- `document.title` becomes `nytimes.com` (generic), `document.body.innerText` is empty, and no `article` node is present.
- Only script seen is `https://ct.captcha-delivery.com/c.js`.
- The page includes an iframe to `https://geo.captcha-delivery.com/captcha/...` titled `DataDome CAPTCHA`.

**Implication**
- In this execution environment, the first effective “hiding layer” is bot/automation differential rendering, which prevents article HTML from being delivered to automation contexts.

### 2) Direct HTTP fetch is blocked before article retrieval
**Observed**
- `curl -I` with a modern Chrome user-agent returns `HTTP/1.1 403 Forbidden` and `CONNECT tunnel failed`.

**Implication**
- Network-level controls in this environment also block direct retrieval, so article-body hydration traces cannot be validated here.

## Mechanism classification

### Primary mechanism observed in this environment
- **Type**: Bot/automation differential rendering (challenge gate)
- **Confidence**: High (direct DOM/script evidence)

### Likely downstream mechanism on successful human session
**Inferred (not directly verified in this environment)**
- NYT commonly uses a meter/gateway entitlement flow after initial render, where non-entitled readers may see a teaser + subscription prompt.
- This likely occurs only after passing anti-bot checks and receiving normal article app payloads.

## Practical capture guidance for archival pipelines

1. **Preserve ordinary browser characteristics**
   - Use a real persistent profile (cookies/history), standard locale/timezone, and non-synthetic interaction pacing.

2. **Treat anti-bot challenge as a separate precondition**
   - If challenge assets (`captcha-delivery.com`) appear, stop extraction and mark run as `blocked_pre_article`.

3. **Only run article-body extraction after challenge-free load**
   - Require presence of `article` (or NYT article container equivalent) and minimum text-length thresholds before capture.

4. **Store diagnostic artifacts per failed run**
   - Save title, first scripts loaded, and top-level iframe URLs to distinguish anti-bot blocks from paywall entitlements.

5. **Use compliant fallback paths when blocked**
   - If anti-bot challenges persist, switch from headless automation to a user-operated browser flow with authorized access, then archive from the fully rendered page state.
   - Prefer official/licensed or user-export paths where available (publisher APIs, RSS/newsletter copies, or user-initiated print/save output).
   - Record provenance metadata (`capture_method`, `auth_context`, timestamp, source URL) so downstream consumers can audit how text was obtained.

## Deterministic detection signals

- **Blocked before content**
  - `document.scripts` includes `ct.captcha-delivery.com/c.js`
  - iframe source contains `geo.captcha-delivery.com/captcha`
  - `article` element absent after load settle window

- **Ready for entitlement/paywall analysis**
  - Normal NYT app bundles load
  - Article container exists
  - Content or teaser text appears in DOM

## Confidence statement
- Anti-bot challenge gate findings: **High confidence (Observed)**.
- Specific NYT post-challenge paywall internals on this URL: **Unconfirmed in this environment** due challenge interception.

## Non-goals and safety boundary
- This document does **not** provide bypass instructions for CAPTCHA, bot-detection, account controls, or subscription enforcement.
- Recommended operation is limited to lawful archival and authorized-access contexts.
