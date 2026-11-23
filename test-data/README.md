# Test data guide

Ready-made files for trying every rule of the discount engine, including the edge cases.
Every expected result below was produced by running these exact files through the app's own
CSV reader, PDF reader (pdf.js) and discount engine, so the app should match it exactly.
Regenerate everything with `npm run make:test-data`.

## Which file goes where

| Box in the app | Upload | Format |
|---|---|---|
| **Discount Rules** | `rules.csv` | `rule_id, scope, applies_to, type, value, stackable, min_cart_value` |
| **Cart Items → cart.csv** | `cart*.csv` | `item_id, product, brand, platform, base_price` |
| **Cart Items → Cart PDF** | `*.pdf` | Table with columns Product, Brand, Platform, Base Price |
| **Add a Rule in Plain English** | type a sentence | see [13-plain-english-rules.md](13-plain-english-rules.md) |

Rule fields: `scope` is `brand`, `platform` or `cart`; `type` is `percentage` or `flat`;
`applies_to` is the brand/platform name (empty for cart rules); `min_cart_value` is only for cart rules.

Typical flow: upload rules first, then a cart, click **Calculate Discounts** once. After that,
every new rules file, cart file, PDF or confirmed plain-English rule re-runs the prices automatically.

## Scenarios

| Folder | Scenario |
|---|---|
| [01-brief-sample](#01-brief-sample) | The sample data from the brief |
| [02-tie-break](#02-tie-break) | Two offers give the same saving |
| [03-stacking](#03-stacking) | Several stackable offers on one item |
| [04-flat-discount-floor](#04-flat-discount-floor) | Flat discount bigger than the price |
| [05-cart-threshold](#05-cart-threshold) | Cart total exactly at, just below, and pushed below the threshold |
| [06-multiple-cart-rules](#06-multiple-cart-rules) | Several cart offers competing |
| [07-messy-names](#07-messy-names) | Inconsistent spelling of brands and platforms |
| [08-broken-rules-csv](#08-broken-rules-csv) | A rules file full of mistakes |
| [09-broken-cart-csv](#09-broken-cart-csv) | A cart file with bad rows and different price formats |
| [10-wrong-files](#10-wrong-files) | Empty or wrong files |
| [11-pdf-big-order](#11-pdf-big-order) | Two-page order PDF, price variants and a wrapped name |
| [12-pdf-problems](#12-pdf-problems) | PDFs that cannot be used (or only partly) |
| [13-plain-english-rules.md](13-plain-english-rules.md) | Sentences to type into the plain-English box |

---

## 01-brief-sample

### The sample data from the brief

**What it tests:** The baseline every reviewer checks first: max-discount selection, stacking, no-offer note, and the RULE-04 cart offer.

**Steps:**
1. Upload `rules.csv` and `cart.csv`, then click **Calculate Discounts**.
2. Then upload `cart.pdf`: same cart from a PDF, so the totals must be identical.

**rules.csv →** 4 active rules: RULE-01 (platform Amazon India, 15% off); RULE-02 (brand Natura Casa, Rs.150 off); RULE-03 (platform Flipkart, 10% off, stackable); RULE-04 (cart, 10% off, cart ≥ Rs.4,000)


#### Upload `cart.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Cushion Cover (Natura Casa · Amazon India) | Rs.1,299 | RULE-01 wins (Rs.195 saving > Rs.150) | **Rs.1,104** | Max discount | Amazon India offer: 15% off (saves Rs.195, more than the Rs.150 Natura Casa brand offer) |
| ITEM-02 | Bed Sheet Set (Natura Casa · Flipkart) | Rs.849 | RULE-02 (−Rs.150) + RULE-03 stacked (−10%) | **Rs.629** | Stacked | Natura Casa brand offer: Rs.150 off + Flipkart offer: extra 10% off (stacked) |
| ITEM-03 | Wall Shelf (LivSpace Pro · Amazon India) | Rs.599 | RULE-01 (15% off) | **Rs.509** | Discount applied | Amazon India offer: 15% off |
| ITEM-04 | Ceramic Vase (LivSpace Pro · Noon) | Rs.2,499 | No rules match | **Rs.2,499** | No offer | No offers available |
| ITEM-05 | Cutting Board (Nordic Basics · Amazon India) | Rs.449 | RULE-01 (15% off) | **Rs.382** | Discount applied | Amazon India offer: 15% off |
| ITEM-06 | Desk Organiser (Nordic Basics · Flipkart) | Rs.899 | RULE-03 (10% off, stackable) | **Rs.809** | Discount applied | Flipkart offer: 10% off |

- Cart total before cart offer: **Rs.5,932**
- Cart offer row: **Cart offer: 10% off — Rs.593 saved**: RULE-04: Rs.5,932 ≥ Rs.4,000 → 10% off entire cart → −Rs.593
- **Final cart total: Rs.5,339** (customer saves Rs.1,255)

#### Upload `cart.pdf`

- **Message:** Loaded 6 items from order OP-9921

| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Cushion Cover (Natura Casa · Amazon India) | Rs.1,299 | RULE-01 wins (Rs.195 saving > Rs.150) | **Rs.1,104** | Max discount | Amazon India offer: 15% off (saves Rs.195, more than the Rs.150 Natura Casa brand offer) |
| ITEM-02 | Bed Sheet Set (Natura Casa · Flipkart) | Rs.849 | RULE-02 (−Rs.150) + RULE-03 stacked (−10%) | **Rs.629** | Stacked | Natura Casa brand offer: Rs.150 off + Flipkart offer: extra 10% off (stacked) |
| ITEM-03 | Wall Shelf (LivSpace Pro · Amazon India) | Rs.599 | RULE-01 (15% off) | **Rs.509** | Discount applied | Amazon India offer: 15% off |
| ITEM-04 | Ceramic Vase (LivSpace Pro · Noon) | Rs.2,499 | No rules match | **Rs.2,499** | No offer | No offers available |
| ITEM-05 | Cutting Board (Nordic Basics · Amazon India) | Rs.449 | RULE-01 (15% off) | **Rs.382** | Discount applied | Amazon India offer: 15% off |
| ITEM-06 | Desk Organiser (Nordic Basics · Flipkart) | Rs.899 | RULE-03 (10% off, stackable) | **Rs.809** | Discount applied | Flipkart offer: 10% off |

- Cart total before cart offer: **Rs.5,932**
- Cart offer row: **Cart offer: 10% off — Rs.593 saved**: RULE-04: Rs.5,932 ≥ Rs.4,000 → 10% off entire cart → −Rs.593
- **Final cart total: Rs.5,339** (customer saves Rs.1,255)

**Look for:**
- ITEM-01: RULE-01 (Rs.195) beats RULE-02 (Rs.150); the reason says so.
- ITEM-02: Rs.849 → Rs.699 → Rs.629 (brand offer, then 10% Flipkart stacked on the reduced price).
- ITEM-04: "No offers available".
- Cart offer row: 10% off, Rs.593 saved. Final total **Rs.5,339**.

---

## 02-tie-break

### Two offers give the same saving

**What it tests:** Ties between non-stackable rules go to the lowest rule ID in natural order (RULE-9 before RULE-10), and savings are compared exactly, before rounding.

**Steps:**
1. Upload `rules.csv` and `cart.csv`.

**rules.csv →** 4 active rules: RULE-9 (platform Amazon India, 20% off); RULE-10 (brand Natura Casa, Rs.200 off); RULE-11 (brand Nordic Basics, Rs.150 off); RULE-12 (platform Flipkart, Rs.150 off)


#### Upload `cart.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Cushion Cover (Natura Casa · Amazon India) | Rs.1,000 | RULE-9 wins tie with RULE-10 (both Rs.200, lower rule ID) | **Rs.800** | Max discount | Amazon India offer: 20% off (same saving as the Natura Casa brand offer, so we applied one of them) |
| ITEM-02 | Desk Lamp (Nordic Basics · Flipkart) | Rs.750 | RULE-11 wins tie with RULE-12 (both Rs.150, lower rule ID) | **Rs.600** | Max discount | Nordic Basics brand offer: Rs.150 off (same saving as the Flipkart offer, so we applied one of them) |
| ITEM-03 | Jute Rug (Natura Casa · Amazon India) | Rs.1,001 | RULE-9 wins (Rs.200.2 saving > Rs.200) | **Rs.801** | Max discount | Amazon India offer: 20% off (same saving as the Natura Casa brand offer, so we applied one of them) |
| ITEM-04 | Door Mat (Natura Casa · Amazon India) | Rs.999 | RULE-10 wins (Rs.200 saving > Rs.199.8) | **Rs.799** | Max discount | Natura Casa brand offer: Rs.200 off (same saving as the Amazon India offer, so we applied one of them) |

- Cart total before cart offer: **Rs.3,000**
- Cart offer row: *not shown* (no cart offer qualifies)
- **Final cart total: Rs.3,000** (customer saves Rs.750)

**Look for:**
- Every item shows "same saving as the …": the customer pays the same whole-rupee price whichever offer applies.
- ITEM-01: 20% of 1,000 = Rs.200 = flat Rs.200, an exact tie, so RULE-9 wins (natural order; plain text sorting would wrongly pick RULE-10).
- ITEM-02: Rs.150 vs Rs.150 tie, so RULE-11 wins.
- ITEM-03: 20% of 1,001 = Rs.200.20 beats flat Rs.200. Both show as Rs.200, but the exact amount decides.
- ITEM-04: 20% of 999 = Rs.199.80 loses to flat Rs.200, so RULE-10 wins.

---

## 03-stacking

### Several stackable offers on one item

**What it tests:** Stackable rules apply on top of the winner, each on the already-reduced price, in rule ID order; a stackable rule also applies alone when nothing else matches.

**Steps:**
1. Upload `rules.csv` and `cart.csv`.

**rules.csv →** 4 active rules: RULE-01 (brand Natura Casa, Rs.150 off); RULE-02 (platform Flipkart, 10% off, stackable); RULE-03 (brand Natura Casa, Rs.100 off, stackable); RULE-04 (platform Amazon India, 5% off, stackable)


#### Upload `cart.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Bed Sheet Set (Natura Casa · Flipkart) | Rs.1,000 | RULE-01 (−Rs.150) + RULE-02 stacked (−10%) + RULE-03 stacked (−Rs.100) | **Rs.665** | Stacked | Natura Casa brand offer: Rs.150 off + Flipkart offer: extra 10% off (stacked) + Natura Casa brand offer: extra Rs.100 off (stacked) |
| ITEM-02 | Desk Organiser (Nordic Basics · Flipkart) | Rs.899 | RULE-02 (10% off, stackable) | **Rs.809** | Discount applied | Flipkart offer: 10% off |
| ITEM-03 | Cushion Cover (Natura Casa · Amazon India) | Rs.1,299 | RULE-01 (−Rs.150) + RULE-03 stacked (−Rs.100) + RULE-04 stacked (−5%) | **Rs.997** | Stacked | Natura Casa brand offer: Rs.150 off + Natura Casa brand offer: extra Rs.100 off (stacked) + Amazon India offer: extra 5% off (stacked) |
| ITEM-04 | Ceramic Vase (LivSpace Pro · Noon) | Rs.2,499 | No rules match | **Rs.2,499** | No offer | No offers available |

- Cart total before cart offer: **Rs.4,970**
- Cart offer row: *not shown* (no cart offer qualifies)
- **Final cart total: Rs.4,970** (customer saves Rs.727)

**Look for:**
- ITEM-01: 1,000 − 150 = 850 → −10% = 765 → −100 = **665** (RULE-01, then RULE-02, then RULE-03).
- ITEM-02: only a stackable rule matches, so it applies on its own: 899 × 0.9 = **809**.
- ITEM-03: 1,299 − 150 = 1,149 → −100 = 1,049 → −5% = 996.55 → **997** (rounded once, at the end).

---

## 04-flat-discount-floor

### Flat discount bigger than the price

**What it tests:** A flat discount never makes a price negative. It stops at Rs.0, and a stacked % on Rs.0 stays Rs.0.

**Steps:**
1. Upload `rules.csv` and `cart.csv`.

**rules.csv →** 2 active rules: RULE-01 (brand Budget Home, Rs.500 off); RULE-02 (platform Noon, 10% off, stackable)


#### Upload `cart.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Coaster Set (Budget Home · Amazon India) | Rs.299 | RULE-01 (Rs.500 off) | **Rs.0** | Discount applied | Budget Home brand offer: Rs.500 off |
| ITEM-02 | Tea Towel (Budget Home · Noon) | Rs.450 | RULE-01 (−Rs.500) + RULE-02 stacked (−10%) | **Rs.0** | Stacked | Budget Home brand offer: Rs.500 off + Noon offer: extra 10% off (stacked) |
| ITEM-03 | Table Lamp (Budget Home · Flipkart) | Rs.799 | RULE-01 (Rs.500 off) | **Rs.299** | Discount applied | Budget Home brand offer: Rs.500 off |
| ITEM-04 | Dinner Plate (Other Brand · Noon) | Rs.300 | RULE-02 (10% off, stackable) | **Rs.270** | Discount applied | Noon offer: 10% off |

- Cart total before cart offer: **Rs.569**
- Cart offer row: *not shown* (no cart offer qualifies)
- **Final cart total: Rs.569** (customer saves Rs.1,279)

**Look for:**
- ITEM-01 and ITEM-02 become **Rs.0**, not negative. "You save" equals the base price.
- ITEM-03: 799 − 500 = 299.

---

## 05-cart-threshold

### Cart total exactly at, just below, and pushed below the threshold

**What it tests:** The cart offer condition is "≥ Rs.4,000", checked on the total *after* item discounts. Just below the threshold, the cart offer row disappears and an "Add Rs.X more" nudge shows instead.

**Steps:**
1. Upload `rules.csv`.
2. Upload each cart file one after another. The summary re-runs every time.

**rules.csv →** 2 active rules: RULE-01 (platform Amazon India, 15% off); RULE-04 (cart, 10% off, cart ≥ Rs.4,000)


#### Upload `cart-exactly-4000.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Ceramic Vase (LivSpace Pro · Noon) | Rs.2,500 | No rules match | **Rs.2,500** | No offer | No offers available |
| ITEM-02 | Floor Lamp (LivSpace Pro · Noon) | Rs.1,500 | No rules match | **Rs.1,500** | No offer | No offers available |

- Cart total before cart offer: **Rs.4,000**
- Cart offer row: **Cart offer: 10% off — Rs.400 saved**: RULE-04: Rs.4,000 ≥ Rs.4,000 → 10% off entire cart → −Rs.400
- **Final cart total: Rs.3,600** (customer saves Rs.400)

#### Upload `cart-3999.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Ceramic Vase (LivSpace Pro · Noon) | Rs.2,500 | No rules match | **Rs.2,500** | No offer | No offers available |
| ITEM-02 | Floor Lamp (LivSpace Pro · Noon) | Rs.1,499 | No rules match | **Rs.1,499** | No offer | No offers available |

- Cart total before cart offer: **Rs.3,999**
- Cart offer row: *not shown* (no cart offer qualifies)
- Nudge: "Add Rs.1 more to unlock 10% off your cart" (RULE-04)
- **Final cart total: Rs.3,999**

#### Upload `cart-item-discount-drops-below.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Sofa Throw (Natura Casa · Amazon India) | Rs.4,200 | RULE-01 (15% off) | **Rs.3,570** | Discount applied | Amazon India offer: 15% off |

- Cart total before cart offer: **Rs.3,570**
- Cart offer row: *not shown* (no cart offer qualifies)
- Nudge: "Add Rs.430 more to unlock 10% off your cart" (RULE-04)
- **Final cart total: Rs.3,570** (customer saves Rs.630)

**Look for:**
- Exactly Rs.4,000: the cart offer **applies** (≥), Rs.400 off → Rs.3,600.
- Rs.3,999: **no** cart offer row; instead "Add Rs.1 more to unlock 10% off your cart".
- Base price Rs.4,200 is above the threshold, but after 15% off the item costs Rs.3,570, so no cart offer and a nudge for Rs.430. The threshold uses final item prices, as the brief says.

---

## 06-multiple-cart-rules

### Several cart offers competing

**What it tests:** Only one cart offer applies: the biggest rupee saving among those that qualify. A cart rule marked stackable is still treated as not stackable. The nudge points to the next offer that would beat the current one.

**Steps:**
1. Upload `rules.csv`, then each cart file in turn.

**rules.csv →** 3 active rules: RULE-01 (cart, 10% off, cart ≥ Rs.4,000); RULE-02 (cart, Rs.500 off, cart ≥ Rs.3,000); RULE-03 (cart, 15% off, cart ≥ Rs.10,000)


#### Upload `cart-3500.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Bookshelf (LivSpace Pro · Noon) | Rs.3,500 | No rules match | **Rs.3,500** | No offer | No offers available |

- Cart total before cart offer: **Rs.3,500**
- Cart offer row: **Cart offer: Rs.500 off — Rs.500 saved**: RULE-02: Rs.3,500 ≥ Rs.3,000 → Rs.500 off entire cart → −Rs.500
- Nudge: "Add Rs.6,500 more to unlock 15% off your cart" (RULE-03)
- **Final cart total: Rs.3,000** (customer saves Rs.500)

#### Upload `cart-4500.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Bookshelf (LivSpace Pro · Noon) | Rs.4,500 | No rules match | **Rs.4,500** | No offer | No offers available |

- Cart total before cart offer: **Rs.4,500**
- Cart offer row: **Cart offer: Rs.500 off — Rs.500 saved**: RULE-02: Rs.4,500 ≥ Rs.3,000 → Rs.500 off entire cart → −Rs.500
- Nudge: "Add Rs.5,500 more to unlock 15% off your cart" (RULE-03)
- **Final cart total: Rs.4,000** (customer saves Rs.500)

#### Upload `cart-6000.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Bookshelf (LivSpace Pro · Noon) | Rs.6,000 | No rules match | **Rs.6,000** | No offer | No offers available |

- Cart total before cart offer: **Rs.6,000**
- Cart offer row: **Cart offer: 10% off — Rs.600 saved**: RULE-01: Rs.6,000 ≥ Rs.4,000 → 10% off entire cart → −Rs.600
- Nudge: "Add Rs.4,000 more to unlock 15% off your cart" (RULE-03)
- **Final cart total: Rs.5,400** (customer saves Rs.600)

#### Upload `cart-12000.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Bookshelf (LivSpace Pro · Noon) | Rs.12,000 | No rules match | **Rs.12,000** | No offer | No offers available |

- Cart total before cart offer: **Rs.12,000**
- Cart offer row: **Cart offer: 15% off — Rs.1,800 saved**: RULE-03: Rs.12,000 ≥ Rs.10,000 → 15% off entire cart → −Rs.1,800
- **Final cart total: Rs.10,200** (customer saves Rs.1,800)

**Look for:**
- The rules table shows RULE-02 as **Stackable: No** even though the CSV says `true`.
- Rs.4,500: 10% = Rs.450 loses to flat Rs.500, so RULE-02 wins.
- Rs.6,000: 10% = Rs.600 beats Rs.500, so RULE-01 wins.
- Rs.3,500: the nudge skips RULE-01 (only Rs.400 at Rs.4,000, worse than the Rs.500 you already get) and points to RULE-03.

---

## 07-messy-names

### Inconsistent spelling of brands and platforms

**What it tests:** Matching ignores case, surrounding spaces and doubled inner spaces, but does not guess: "Amazon.in" is a different name.

**Steps:**
1. Upload `rules.csv` and `cart.csv`.

**rules.csv →** 2 active rules: RULE-01 (platform Amazon India, 15% off); RULE-02 (brand Natura Casa, Rs.150 off)


#### Upload `cart.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Cushion Cover (natura casa · Noon) | Rs.1,299 | RULE-02 (Rs.150 off) | **Rs.1,149** | Discount applied | Natura Casa brand offer: Rs.150 off |
| ITEM-02 | Wall Shelf (LivSpace Pro · AMAZON INDIA) | Rs.599 | RULE-01 (15% off) | **Rs.509** | Discount applied | Amazon India offer: 15% off |
| ITEM-03 | Cutting Board (Nordic Basics · Amazon  India) | Rs.449 | RULE-01 (15% off) | **Rs.382** | Discount applied | Amazon India offer: 15% off |
| ITEM-04 | Desk Organiser (Nordic Basics · Amazon.in) | Rs.899 | No rules match | **Rs.899** | No offer | No offers available |

- Cart total before cart offer: **Rs.2,939**
- Cart offer row: *not shown* (no cart offer qualifies)
- **Final cart total: Rs.2,939** (customer saves Rs.307)

**Look for:**
- ITEM-01 to ITEM-03 all get their offer.
- ITEM-04 ("Amazon.in") gets **no** offer. Fuzzy-matching prices would be risky, so this is deliberate.

---

## 08-broken-rules-csv

### A rules file full of mistakes

**What it tests:** Every bad row is skipped with a specific reason; good rows still load. Uses the same validation as AI-parsed rules.

**Steps:**
1. Upload `rules.csv` (and `cart.csv` to see prices with just the valid rules).

**rules.csv →** 2 active rules: RULE-01 (platform Amazon India, 15% off); RULE-09 (platform Flipkart, 10% off, stackable)

- **Skipped:** Row 3 skipped (RULE-02): scope must be brand, platform or cart
- **Skipped:** Row 4 skipped (RULE-03): a percentage discount cannot be more than 100%
- **Skipped:** Row 5 skipped (RULE-04): a cart offer needs a minimum cart value greater than 0
- **Skipped:** Row 6 skipped (RULE-05): a brand offer needs the brand name it applies to
- **Skipped:** Row 7 skipped (RULE-06): value must be greater than 0
- **Skipped:** Row 8 skipped (RULE-07): value must be a number
- **Skipped:** Row 9 skipped: duplicate rule ID RULE-01
- **Skipped:** Row 10 skipped (RULE-08): only cart offers can have a minimum cart value
- **Skipped:** Row 12 skipped: missing rule_id
- **Skipped:** Row 13 skipped (RULE-10): a cart offer applies to the whole cart, not to a brand or platform

#### Upload `cart.csv`


| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Cushion Cover (Natura Casa · Amazon India) | Rs.1,299 | RULE-01 (15% off) | **Rs.1,104** | Discount applied | Amazon India offer: 15% off |
| ITEM-02 | Bed Sheet Set (Natura Casa · Flipkart) | Rs.849 | RULE-09 (10% off, stackable) | **Rs.764** | Discount applied | Flipkart offer: 10% off |
| ITEM-03 | Wall Shelf (LivSpace Pro · Amazon India) | Rs.599 | RULE-01 (15% off) | **Rs.509** | Discount applied | Amazon India offer: 15% off |
| ITEM-04 | Ceramic Vase (LivSpace Pro · Noon) | Rs.2,499 | No rules match | **Rs.2,499** | No offer | No offers available |
| ITEM-05 | Cutting Board (Nordic Basics · Amazon India) | Rs.449 | RULE-01 (15% off) | **Rs.382** | Discount applied | Amazon India offer: 15% off |
| ITEM-06 | Desk Organiser (Nordic Basics · Flipkart) | Rs.899 | RULE-09 (10% off, stackable) | **Rs.809** | Discount applied | Flipkart offer: 10% off |

- Cart total before cart offer: **Rs.6,067**
- Cart offer row: *not shown* (no cart offer qualifies)
- **Final cart total: Rs.6,067** (customer saves Rs.527)

**Look for:**
- Only RULE-01 and RULE-09 load (2 rules); 10 rows are skipped with reasons.
- `stackable` accepts `yes` as well as `true`.

---

## 09-broken-cart-csv

### A cart file with bad rows and different price formats

**What it tests:** Prices like "Rs.1,299", "₹899" and "INR 1499" are understood; missing fields, text, negative and zero prices are skipped with a reason.

**Steps:**
1. Upload `rules.csv` and `cart.csv`.

**rules.csv →** 4 active rules: RULE-01 (platform Amazon India, 15% off); RULE-02 (brand Natura Casa, Rs.150 off); RULE-03 (platform Flipkart, 10% off, stackable); RULE-04 (cart, 10% off, cart ≥ Rs.4,000)


#### Upload `cart.csv`

- **Skipped:** Row 3 skipped: missing brand
- **Skipped:** Row 4 skipped: "abc" is not a valid price
- **Skipped:** Row 5 skipped: "-2499" is not a valid price
- **Skipped:** Row 6 skipped: "0" is not a valid price
- **Skipped:** Row 9 skipped: missing product

| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Cushion Cover (Natura Casa · Amazon India) | Rs.1,299 | RULE-01 wins (Rs.195 saving > Rs.150) | **Rs.1,104** | Max discount | Amazon India offer: 15% off (saves Rs.195, more than the Rs.150 Natura Casa brand offer) |
| ITEM-06 | Desk Organiser (Nordic Basics · Flipkart) | Rs.899 | RULE-03 (10% off, stackable) | **Rs.809** | Discount applied | Flipkart offer: 10% off |
| ITEM-07 | Table Runner (Natura Casa · Flipkart) | Rs.1,499 | RULE-02 (−Rs.150) + RULE-03 stacked (−10%) | **Rs.1,214** | Stacked | Natura Casa brand offer: Rs.150 off + Flipkart offer: extra 10% off (stacked) |

- Cart total before cart offer: **Rs.3,127**
- Cart offer row: *not shown* (no cart offer qualifies)
- Nudge: "Add Rs.873 more to unlock 10% off your cart" (RULE-04)
- **Final cart total: Rs.3,127** (customer saves Rs.570)

**Look for:**
- 3 items load (ITEM-01, 06, 07); 5 rows are listed as skipped.
- Cart total is below Rs.4,000, so a nudge shows instead of the cart offer.

---

## 10-wrong-files

### Empty or wrong files

**What it tests:** A file with nothing usable shows a clear error and **does not wipe** what was already loaded.

**Steps:**
1. First load `01-brief-sample/rules.csv` and `cart.csv` and calculate.
2. Then upload each file here into the box named in the table below. Each one shows an error, and the previous rules and cart stay on screen.

| File | Upload into | What you should see |
|---|---|---|
| `cart-header-only.csv` | cart.csv | Error: No cart items found. Expected columns: item_id, product, brand, platform, base_price. — previous data kept |
| `cart-empty.csv` | cart.csv | Error: This file is empty. Expected columns: item_id, product, brand, platform, base_price. — previous data kept |
| `rules-file-uploaded-as-cart.csv` | cart.csv | Error: This doesn't look like a cart file (missing: item_id, product, brand, platform, base_price). Expected columns: item_id, product, brand, platform, base_price. — previous data kept |
| `rules-header-only.csv` | rules.csv | Error: No rules found. Expected columns: rule_id, scope, applies_to, type, value, stackable, min_cart_value. — previous data kept |
| `cart-file-uploaded-as-rules.csv` | rules.csv | Error: This doesn't look like a rules file (missing: rule_id, scope, type, value). Expected columns: rule_id, scope, applies_to, type, value, stackable, min_cart_value. — previous data kept |

---

## 11-pdf-big-order

### Two-page order PDF, price variants and a wrapped name

**What it tests:** The PDF table continues onto page 2 (header repeated), prices use different formats ("Rs.1,299", "Rs. 1299", "INR 1299", "1,299"), and one long product name wraps onto a second line.

**Steps:**
1. Upload `rules.csv`, then upload `order.pdf` in the **Cart PDF** box.

**rules.csv →** 4 active rules: RULE-01 (platform Amazon India, 15% off); RULE-02 (brand Natura Casa, Rs.150 off); RULE-03 (platform Flipkart, 10% off, stackable); RULE-04 (cart, 10% off, cart ≥ Rs.4,000)


#### Upload `order.pdf`

- **Message:** Loaded 23 items from order OP-10457

| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Cushion Cover (Natura Casa · Amazon India) | Rs.299 | RULE-02 wins (Rs.150 saving > Rs.45) | **Rs.149** | Max discount | Natura Casa brand offer: Rs.150 off (saves Rs.150, more than the Rs.45 Amazon India offer) |
| ITEM-02 | Bed Sheet Set (Natura Casa · Flipkart) | Rs.672 | RULE-02 (−Rs.150) + RULE-03 stacked (−10%) | **Rs.470** | Stacked | Natura Casa brand offer: Rs.150 off + Flipkart offer: extra 10% off (stacked) |
| ITEM-03 | Table Runner (Natura Casa · Noon) | Rs.1,045 | RULE-02 (Rs.150 off) | **Rs.895** | Discount applied | Natura Casa brand offer: Rs.150 off |
| ITEM-04 | Throw Blanket (Natura Casa · Amazon India) | Rs.1,418 | RULE-01 wins (Rs.213 saving > Rs.150) | **Rs.1,205** | Max discount | Amazon India offer: 15% off (saves Rs.213, more than the Rs.150 Natura Casa brand offer) |
| ITEM-05 | Curtain Pair (Natura Casa · Flipkart) | Rs.1,791 | RULE-02 (−Rs.150) + RULE-03 stacked (−10%) | **Rs.1,477** | Stacked | Natura Casa brand offer: Rs.150 off + Flipkart offer: extra 10% off (stacked) |
| ITEM-06 | Handwoven Jute Area Rug (5x7 ft) (Natura Casa · Flipkart) | Rs.2,150 | RULE-02 (−Rs.150) + RULE-03 stacked (−10%) | **Rs.1,800** | Stacked | Natura Casa brand offer: Rs.150 off + Flipkart offer: extra 10% off (stacked) |
| ITEM-07 | Bath Towel Set (Natura Casa · Noon) | Rs.2,164 | RULE-02 (Rs.150 off) | **Rs.2,014** | Discount applied | Natura Casa brand offer: Rs.150 off |
| ITEM-08 | Wall Shelf (LivSpace Pro · Amazon India) | Rs.2,537 | RULE-01 (15% off) | **Rs.2,156** | Discount applied | Amazon India offer: 15% off |
| ITEM-09 | Ceramic Vase (LivSpace Pro · Flipkart) | Rs.2,910 | RULE-03 (10% off, stackable) | **Rs.2,619** | Discount applied | Flipkart offer: 10% off |
| ITEM-10 | Floor Lamp (LivSpace Pro · Noon) | Rs.583 | No rules match | **Rs.583** | No offer | No offers available |
| ITEM-11 | Shoe Rack (LivSpace Pro · Amazon India) | Rs.956 | RULE-01 (15% off) | **Rs.813** | Discount applied | Amazon India offer: 15% off |
| ITEM-12 | Coffee Table (LivSpace Pro · Flipkart) | Rs.1,329 | RULE-03 (10% off, stackable) | **Rs.1,196** | Discount applied | Flipkart offer: 10% off |
| ITEM-13 | Bookshelf (LivSpace Pro · Noon) | Rs.1,702 | No rules match | **Rs.1,702** | No offer | No offers available |
| ITEM-14 | Cutting Board (Nordic Basics · Amazon India) | Rs.2,075 | RULE-01 (15% off) | **Rs.1,764** | Discount applied | Amazon India offer: 15% off |
| ITEM-15 | Desk Organiser (Nordic Basics · Flipkart) | Rs.2,448 | RULE-03 (10% off, stackable) | **Rs.2,203** | Discount applied | Flipkart offer: 10% off |
| ITEM-16 | Spice Rack (Nordic Basics · Noon) | Rs.2,821 | No rules match | **Rs.2,821** | No offer | No offers available |
| ITEM-17 | Laundry Basket (Nordic Basics · Amazon India) | Rs.494 | RULE-01 (15% off) | **Rs.420** | Discount applied | Amazon India offer: 15% off |
| ITEM-18 | Wall Clock (Nordic Basics · Flipkart) | Rs.867 | RULE-03 (10% off, stackable) | **Rs.780** | Discount applied | Flipkart offer: 10% off |
| ITEM-19 | Plant Stand (Nordic Basics · Noon) | Rs.1,240 | No rules match | **Rs.1,240** | No offer | No offers available |
| ITEM-20 | Ceramic Mug Set (Nordic Basics · Amazon India) | Rs.649 | RULE-01 (15% off) | **Rs.552** | Discount applied | Amazon India offer: 15% off |
| ITEM-21 | Photo Frame (LivSpace Pro · Flipkart) | Rs.399 | RULE-03 (10% off, stackable) | **Rs.359** | Discount applied | Flipkart offer: 10% off |
| ITEM-22 | Cotton Rug (Natura Casa · Noon) | Rs.1,899 | RULE-02 (Rs.150 off) | **Rs.1,749** | Discount applied | Natura Casa brand offer: Rs.150 off |
| ITEM-23 | Door Stopper (Nordic Basics · Noon) | Rs.199 | No rules match | **Rs.199** | No offer | No offers available |

- Cart total before cart offer: **Rs.29,166**
- Cart offer row: **Cart offer: 10% off — Rs.2,917 saved**: RULE-04: Rs.29,166 ≥ Rs.4,000 → 10% off entire cart → −Rs.2,917
- **Final cart total: Rs.26,249** (customer saves Rs.6,398)

**Look for:**
- 23 items load from both pages. The page-2 title ("Order #… (continued)") and repeated header are not read as items, so ITEM-19 is plain "Plant Stand".
- Every price format is understood ("Rs.2,537", "Rs. 1702", "INR 2075", "2,448").
- Cart total is far above Rs.4,000, so the cart offer applies.
- "Handwoven Jute Area Rug (5x7 ft)" is one item, not two.

---

## 12-pdf-problems

### PDFs that cannot be used (or only partly)

**What it tests:** Each kind of bad PDF gets its own message. If nothing is usable, the current cart is kept. (Password-protected PDFs and PDFs over 5 MB are also handled, with their own messages, but are not included here: the tools used to generate these files cannot encrypt a PDF, and a 5 MB file would bloat the repo.)

**Steps:**
1. Upload `rules.csv` (the brief's rules), then `some-bad-rows.pdf` in the **Cart PDF** box.
2. Then upload each of the other PDFs. Each shows an error and the cart from step 1 stays.

**rules.csv →** 4 active rules: RULE-01 (platform Amazon India, 15% off); RULE-02 (brand Natura Casa, Rs.150 off); RULE-03 (platform Flipkart, 10% off, stackable); RULE-04 (cart, 10% off, cart ≥ Rs.4,000)


#### Upload `some-bad-rows.pdf`

- **Message:** Loaded 2 items from order OP-20001 (3 rows skipped)
- **Skipped:** Row 3 skipped: "Rs.abc" is not a valid price
- **Skipped:** Row 4 skipped: price not found
- **Skipped:** Row 5 skipped: missing brand

| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |
|---|---|---:|---|---:|---|---|
| ITEM-01 | Cushion Cover (Set of 2) (Natura Casa · Amazon India) | Rs.1,299 | RULE-01 wins (Rs.195 saving > Rs.150) | **Rs.1,104** | Max discount | Amazon India offer: 15% off (saves Rs.195, more than the Rs.150 Natura Casa brand offer) |
| ITEM-02 | Bed Sheet Set (Natura Casa · Flipkart) | Rs.849 | RULE-02 (−Rs.150) + RULE-03 stacked (−10%) | **Rs.629** | Stacked | Natura Casa brand offer: Rs.150 off + Flipkart offer: extra 10% off (stacked) |

- Cart total before cart offer: **Rs.1,733**
- Cart offer row: *not shown* (no cart offer qualifies)
- Nudge: "Add Rs.2,267 more to unlock 10% off your cart" (RULE-04)
- **Final cart total: Rs.1,733** (customer saves Rs.415)

| File | Upload into | What you should see |
|---|---|---|
| `all-rows-bad.pdf` | Cart PDF | Error: No cart items found. Expected columns: Product, Brand, Platform, Base Price. (Row 1 skipped: "free" is not a valid price; Row 2 skipped: missing brand) — previous data kept |
| `no-table-header.pdf` | Cart PDF | Error: Couldn't find the cart table. The PDF needs a header row with: Product, Brand, Platform, Base Price. — previous data kept |
| `scanned-no-text.pdf` | Cart PDF | Error: This PDF has no readable text. It looks like a scanned image. Please upload a text-based PDF or the CSV. — previous data kept |
| `not-really-a-pdf.pdf` | Cart PDF | Error: That file isn't a PDF. Please upload the cart as a .pdf (or use the CSV upload). — previous data kept |

---

