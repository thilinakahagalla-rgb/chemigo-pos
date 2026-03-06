# 🧪 Chemigo POS System - Requirements & Technical Specifications

This document outlines the architecture and features for the **Chemigo** POS system, customized for the cleaning products business.

## 🏢 Business Information
- **Name:** Chemigo
- **Address:** 13/3 Temple road Pilanduwa, Warakapola
- **Contact:** 075 88 99 312 / 035 22 600 92

---

## 🛠 Tech Stack
- **Frontend:** HTML5, Tailwind CSS
- **Logic:** JavaScript (ES6+)
- **Database:** [Dexie.js](https://dexie.org/) (Client-side IndexedDB)
- **PDF Generation:** [jsPDF](https://github.com/parallax/jsPDF) & [html2canvas](https://html2canvas.hertzen.com/)
- **Barcode Scanning:** [QuaggaJS](https://serratus.github.io/quaggaJS/) or [Html5-QRCode](https://github.com/mebjas/html5-qrcode) (For Laptop Cam)

---

## 🚀 Key Modules & Functions

### 1. Product & Production Cost Management
Ability to add products with a granular cost breakdown:
- **Product Name & Barcode** (Manual or Cam Scan).
- **Cost Breakdown Fields:**
    - Liquid Cost
    - Bottle Cost
    - Sticker/Label Printing Cost
    - Marketing Allocation
    - Other Expenses
- **Selling Price:** Fixed MSRP.
- **Stock Level:** Current inventory count.

### 2. Expense Tracker (Raw Materials & Overheads)
A separate section to log business outflows:
- Fields for: Raw material (Liquids), Printing materials, Transport.
- **Invoice Upload:** Ability to store images/PDFs of supplier invoices (stored as Base64 in Dexie).
- Description and Date fields.

### 3. Sales & Billing (POS Interface)
- **Barcode Input:** Use laptop camera as a scanner to fetch products.
- **Discounts:** Item-wise discount (Percentage or Flat).
- **Courier Charges:** Ability to add a delivery fee to the final total.
- **Calculated Fields:** Automatically calculate the "Profit" for the sale.

### 4. Receipt & Invoice Generation
- **80mm Thermal Bill:** - Business details at the top.
    - Itemized list.
    - Footer: **"ඔබට ලැබුනු ලාබය: [Total Discount Amount]"**
- **A4 PDF Invoice:** A professional layout for wholesale or formal deliveries, downloadable via JS.

### 5. Loyalty & Customer Management
- **Registration:** Name, Address, and Phone Number.
- **Unique ID:** Customer's phone number acts as the Primary Key.
- **Loyalty Points:** Automatic calculation based on total purchase value (e.g., 1 point for every 100 LKR).

---

## 🏗 Database Schema (Dexie.js)

```javascript
const db = new Dexie('ChemigoDB');
db.version(1).stores({
  products: '++id, barcode, name, sellingPrice',
  expenses: '++id, category, date',
  customers: '++id, phone, name',
  sales: '++id, date, customerPhone'
});