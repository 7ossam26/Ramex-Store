# Hardware Setup — Ramex Store

## Thermal Printer: Xprinter XP-480B

| Property | Value |
|---|---|
| Model | Xprinter XP-480B |
| Type | Direct thermal receipt/label printer |
| Paper width | 80 mm roll |
| Printable width | ~72 mm |
| Connection | USB (appears as system printer in Windows) |
| Windows driver name | `Xprinter XP-480B` |

### Label sizes in use

| Label type | PDF size | Notes |
|---|---|---|
| Fabric label (thermal) | 150 × 100 mm | Full sticker with brand, supplier, composition, barcode |
| Simple barcode label | 50 × 30 mm (configurable via `barcode_label_size` setting) | Roll SR# + Code128 barcode |

### Chrome print settings (set once, remembered per printer)

- Printer: `Xprinter XP-480B`
- Paper size: match the label size above
- Margins: None / Minimum
- Scale: 100% (do not fit to page)
- Headers and footers: Off

### Print flow (how it works in code)

1. User clicks any print button (labels, fabric labels, batch)
2. Frontend calls backend API via Axios (`responseType: 'blob'`)
3. Backend generates PDF with `pdfmake` + `bwip-js`, responds with `Content-Disposition: inline`
4. `openPdfBlob(blob)` in `frontend/src/lib/pdf.ts` creates a blob URL, injects a full-screen `opacity:0` iframe, waits 500 ms for Chrome's PDF renderer, then calls `iframe.contentWindow.print()`
5. Chrome print dialog opens with the label already rendered and the XPrinter pre-selected

### Known gotchas

- **IDM (Internet Download Manager)**: IDM's browser extension intercepts XHR requests and causes `net::ERR_BLOCKED_BY_CLIENT`. Disable IDM for `localhost` in IDM Options → General → exclusion list, or disable the IDM browser extension while using the app.
- **Chrome "Download PDFs" setting**: If Chrome is set to download PDFs instead of viewing them, the blob URL approach still works because `contentWindow.print()` bypasses the download handler.

---

## Barcode Scanner: Syble SC-3030

| Property | Value |
|---|---|
| Model | Syble SC-3030 |
| Type | 1D/2D USB barcode scanner |
| Mode | HID keyboard-wedge (plug and play, no driver needed) |
| Output | Sends scanned value as keystrokes + Enter to the active input |

### How it integrates

The scanner works with the `ScannerInput` component (`frontend/src/components/ScannerInput.tsx`):
- Plug in via USB — Windows recognises it as a keyboard device
- Focus must be on the scanner input field
- Scanner fires keystrokes ending in `Enter`, which triggers the `onScan` callback
- No configuration needed

### Pages that use the scanner

| Page | What happens on scan |
|---|---|
| POS (`/pos`) | Looks up roll by barcode → adds to cart or triggers return |

### Known gotchas

- If focus drifts away from the input (e.g. user clicked elsewhere), scanner characters go to the wrong element. The `ScannerInput` component has `autoFocus` but the user may need to click the field again after navigating around the page.
