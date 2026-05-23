# Hardware Integration Plan (Ramex-Store)

This document serves as the standard reference for integrating external hardware (Scanners, Printers) into the Ramex-Store web application.

## 1. Barcode Scanner (Gpos L200 2d)
- **Type**: USB / 2D Barcode Scanner.
- **Hardware Setup**: Operates in "Plug & Play" mode (USB Keyboard Emulation). No special drivers required.
- **Scanner Configuration**: Must be configured to append an `Enter` (Carriage Return) keystroke automatically at the end of each scan (factory default).
- **Software Implementation**:
  - The frontend will utilize a **Global Event Listener** in React.
  - The listener will detect rapid keystrokes (typical of a scanner, usually <30ms per keystroke) that terminate with an `Enter` key.
  - This allows users to scan barcodes anywhere in the POS/Inventory screens without manually focusing on an input field.

## 2. Barcode Sticker Printer (Xprinter XP-480p)
- **Paper Size**: 10x15 cm.
- **Hardware Setup**: Standard Windows printer driver installation.
- **Software Implementation**:
  - **Primary Method (Browser Print)**: A specific React component will be built for the barcode sticker. The CSS will use `@page { size: 100mm 150mm; margin: 0; }` and `@media print` to ensure pixel-perfect layout. 
  - **Upgrade Path (Silent Print)**: If the manual browser print dialog slows down operations, we will integrate **QZ Tray**. QZ Tray is a local client that allows the web app to bypass the browser dialog and send prints directly to the Xprinter silently.

## 3. A4 Invoice Printer
- **Paper Size**: Standard A4.
- **Hardware Setup**: Standard Windows printer driver installation.
- **Software Implementation**:
  - Printing is handled natively via the browser (`window.print()`).
  - Active Files: 
    - `frontend/src/pages/invoices/DraftInvoicePrintPage.tsx` (Route & Trigger)
    - `frontend/src/components/invoices/DraftInvoiceDocument.tsx` (Layout)
    - `frontend/src/components/invoices/DraftInvoiceDocument.css` (Styles)
  - CSS `@media print` is strictly utilized to hide all UI elements (buttons, sidebars) and present a clean, formal invoice page without browser headers/footers.

## General Rules
- Always use CSS `@media print` to control visibility of elements during printing.
- Disable browser default headers and footers in the print dialog or via CSS `@page { margin: 0; }` where applicable.
