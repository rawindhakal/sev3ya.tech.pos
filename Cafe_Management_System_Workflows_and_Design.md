# System Workflow & Interface Design Specification
*Source Context: Functional Mapping inspired by TMBill Restaurant Architecture Engine*

This document translates operational capabilities into formal software engineering specifications, detailing step-by-step system workflows and explicit user interface design layouts for both the Front-End POS Application and the Cloud-Based Back-Office Admin Engine.

---

## SECTION 1: System-Wide Architecture & Core Integrations

The architecture is divided into two operational layers: the **Front-End POS Application** (a native client application compiled for Windows/macOS/Linux/Android to prioritize local processing and hardware interfaces) and the **Back-Office Admin Engine** (a headless or cloud-based browser interface functioning as the unified control panel).

### 1.1 Structural Enterprise Topography

```
+------------------------------------------------------------------------+
|                      CLOUD BACK-OFFICE / HEAD OFFICE                   |
|           (Global Control, Central DB, Report Aggregation)             |
+------------------------------------------------------------------------+
                                   ^
                                   |  [Secure HTTPS Rest API Sync]
                                   v
+------------------------------------------------------------------------+
|                          LOCAL CAFÉ GATEWAY                            |
+------------------------------------------------------------------------+
         |                                 |                       |
         v [Local LAN TCP/IP]              v [Local LAN TCP/IP]    v [local an tcp/ip]
+------------------+             +-------------------+   +-------------------+
|   MASTER POS     |<----------->|   TERMINAL POS    |   |    CAPTAIN APP    |
| (Database Node)  |             | (Counter/Satellite|   | (Handheld/Waiter) |
+------------------+             +-------------------+   +-------------------+
    |            |
    v            v
+-------+    +-------+
|  KDS  |    | TOKEN |
|Monitor|    |Display|
+-------+    +-------+
```

### 1.2 Core External Integration Frameworks
1. **Financial & Accounting Integration Layer:** Bidirectional transaction pipelines pushing encrypted sales journals, VAT summaries, and asset values into external ERP standard instances (such as Tally ERP and SAP systems) via automated nightly sync scripts.
2. **Third-Party Fulfillment Aggregator Engine:** A centralized intake pipeline exposing a uniform data object mapping mechanism for external platforms (e.g., Zomato, Swiggy, ONDC, UberEats, Deliveroo). Online delivery alerts are routed directly into the operational database schema without manual terminal duplication.
3. **Hyper-Local Courier Fleet Orchestration:** An automated webhook architecture capturing delivery confirmation ticks and calculating pickup metrics with third-party delivery dispatch providers (e.g., Lalamove, Borzo, Dunzo, GrabExpress, Porter).
4. **Hardware Device Drivers & Interfacing:** System hooks for handling standard ESC/POS serial interface cash drawers, direct raw TCP/IP raw thermal printers, and USB barcode/NFC readers.

---

## SECTION 2: Front-End POS Application Specifications

### 2.1 Dynamic Functional Workflows

#### Step 1: Initialization & Local DB Hydration
1. The client boots up and performs a connection handshake with the local network gateway.
2. The cashier inputs their security credential code.
3. The system triggers the **Load Menu** state machine, extracting the latest structural schemas (menu tree structure, active tables, custom user parameters, active tax profiles) from the Cloud Database block and caching them inside a local SQLite memory pool.

#### Step 2: Order Type Lifecycle Execution

```
[Customer Request] -> Select Order Type (Dine-In / Takeaway / Quick-Bill)
                           |
                           v
              Input Cart Items & Modifiers
                           |
                           v
        [Dine-In] --------> Capture Seat Number & Log Active Table
        [Takeaway] -------> Capture CRM Details (Name/Phone/Vehicle)
        [Quick-Bill] -----> Skip Intermediate Screens -> Immediate Settle
                           |
                           v
                 Print / Fire KOT to KDS
                           |
                           v
                Settle & Record Payment
```

* **Fulfillment Paths:**
    * **Dine-In:** Renders a table layout layout grid. Selects an active table slot -> inputs items -> saves state -> prints a Kitchen Order Ticket (KOT) or pushes to the KDS -> table layout changes to active colored mode.
    * **Takeaway / Pickup:** Pushes an empty basket frame. Requires an initial text input capture for the user profile (Mobile validation string and Name indicator) -> compiles the payload -> prints a physical receipt tracking code.
    * **Quick-Bill:** Bypasses intermediate state windows. A single-click checkout setup built for express service. Item click instantly sets the cart state directly to transaction processing, utilizing default configurations.

#### Step 3: Transaction Settle Mechanics
1. Cashier executes the checkout function.
2. System loads the payment modal box offering Multi-Payment Mode distribution options (e.g., splitting a $50 check between $20 cash and $30 digital UPI wallet rails).
3. **Cash Settle Engine calculation:** The system captures the customer's cash envelope value input, displays the return change value, opens the local register drawer via an explicit terminal signal, prints a receipt, and sets the table layout back to vacant.

#### Step 4: Local Expense Auditing Workflow
1. Cashier taps the master operational panel widget and inputs a verified supervisor passcode override.
2. The user flags the target expenditure class from an explicit menu option (e.g., Vendor Outflow, Petty Operations, Procurement).
3. Cashier declares the numeric cost amount, records descriptive comments, and clicks confirm. The local drawer tracks the value decline, and the log is synced to the back-office general ledger.

---

### 2.2 User Interface (UI) Design Language

#### Main Terminal Dashboard View
```
+-----------------------------------------------------------------------------------------------------+
| [LOGO] | POS TERMINAL | USER: ADMIN | STATUS: ONLINE                   | 2026-07-04 08:31 AM | [SETTINGS] |
+-----------------------------------------------------------------------------------------------------+
| ORDER MODES:   [ DINE-IN ]    [ TAKEAWAY ]    [ HOME DELIVERY ]    [ QUICK-BILL ]                   |
+--------------------------------------+--------------------------------------------------------------+
| GRID/MENU AREA:                      | ACTIVE CART SUMMARY: TABLE #04                               |
| +------------------+ +-------------+ | +----------------------------------------------------------+ |
| |   ESPRESSO       | | AMERICANO   | | | ITEM                   QTY    UNIT     TOTAL    ACTIONS   | |
| |   [ $3.50 ]      | | [ $4.00 ]   | | +----------------------------------------------------------+ |
| +------------------+ +-------------+ | | Double Espresso         2     $3.50    $7.00    [ + ] [ - ] | |
| +------------------+ +-------------+ | | Oat Milk Latte (Ice)    1     $4.50    $4.50    [ + ] [ - ] | |
| | CAPPUCCINO       | | LATTE       | | | -- Mod: Extra Shot     1     $1.00    $1.00              | |
| |   [ $4.20 ]      | | [ $4.50 ]   | | | Croissant (Butter)     1     $3.75    $3.75    [ + ] [ - ] | |
| +------------------+ +-------------+ | +----------------------------------------------------------+ |
| +------------------+ +-------------+ | | SUB-TOTAL:                             $16.25            | |
| | PASTRY SELECTION | | CROISSANT   | | | SERVICE TAX (10%):                      $1.63            | |
| |   [ EXPLORE ]    | | [ $3.75 ]   | | | TOTAL DUE:                             $17.88            | |
| +------------------+ +-------------+ | +----------------------------------------------------------+ |
|                                      | | CUSTOMER PROFILE: RABIN DHAKAL (+977-98XXXXXXXX)         | |
| [ SEARCH ITEM BY INITIALS: [ CB   ] ]| +----------------------------------------------------------+ |
|                                      | |  [ VOID BASKET ]    [ PRINT KOT ]    [ PROCEED TO PAY ]  | |
+--------------------------------------+--------------------------------------------------------------+
```

* **Design Constraints & Aesthetics:**
    * **Sizing & Layout Scaling:** Built via strict full-bleed, responsive block designs wrapping perfectly without flex configurations. Component structures utilize fixed aspect ratio calculation anchors optimized for 15-inch industrial POS monitors and 10-inch tablets.
    * **Color Profile Matrix:** Deep charcoal workspace backdrop (`#1A1A1A`), pure white item fonts (`#FFFFFF`), active state markers colored in emerald green (`#2ECC71`), and alerts flagged in firebrick red (`#E74C3C`).
    * **Search Interactivity:** An optimization tracking system enabling rapid string pattern matches. Typing standard abbreviations (such as `FC` for Filter Coffee or `CB` for Chicken Burger) automatically isolates target item indexes within milliseconds to limit counter queue delays.

---

## SECTION 3: Back-Office Admin Engine Specifications

### 3.1 Dynamic Functional Workflows

#### Step 1: Real-Time Operational Telemetry (Live Tracking Dashboard)
1. The browser panel instantiates a secure WebSockets or polling loop connected to the transactional database stream.
2. The viewport populates table metrics dynamically, displaying occupancy durations, active financial subtotals, and elapsed ticket time trackers.
3. If an item deletion or ticket void occurs at the physical POS, the local client fires an update webhook. The Live Tracking Monitor catches the record change payload and highlights the void details instantly in the supervisor's dashboard.

#### Step 2: Customer CRM Mapping & Targeted Campaign Cycles
1. The analytics layer tracks customer transaction histories across channels, aggregating data by name, phone hash, total visit volume, and aggregate customer lifetime value (LTV).
2. The user builds custom filter queries (e.g., isolating users who have visited over 5 times and generated net revenues exceeding $500).
3. The platform passes the filtered collection arrays into an integrated SMS/WhatsApp delivery engine, distributing dynamic promo discount codes straight to user terminals.

#### Step 3: Granular Employee Access Configuration
1. The administrator loads the Role Permission Panel.
2. The user creates a distinct staff profile definition (e.g., Front Cashier Level 1) and configures explicit boolean permission markers (e.g., `ALLOW_VOID_ITEMS = FALSE`, `ALLOW_MANUAL_EXPENSE = FALSE`, `ALLOW_DASHBOARD_METRICS = FALSE`).
3. Toggling these rules pushes an encrypted JSON parameters configuration bundle down to the target physical terminal node, instantly adjusting the front-end POS interface configuration layout.

#### Step 4: End-to-End Inventory & Recipe Lifecycle Management
1. The production manager builds a specific ingredient index matrix (e.g., tracking Espresso Green Beans down to raw gram metrics).
2. The manager defines a precise sub-recipe framework (e.g., a standard double espresso shot consumes exactly 18 grams of roasted beans).
3. When the front-end POS completes a transaction for an iced latte, the system triggers an inventory calculation script, automatically deducting 18 grams of espresso beans and 250 milliliters of milk from active warehouse inventory buckets.

---

### 3.2 User Interface (UI) Design Language

#### Back-Office Admin Master Control View
```
+-----------------------------------------------------------------------------------------------------+
| NEXTGEN CAFÉ BACK-OFFICE  |  BRANCH: GLOBAL HUB  |  ROLE: CORPORATE ADMIN     | [ THEME: DARK TOGGLE ] |
+-----------------------------------------------------------------------------------------------------+
| [DASHBOARD]   [LIVE TRACKING]   [MENU DESIGNER]   [INVENTORY LAB]   [CRM HUB]   [EMPLOYEES]  [REPORTS]  |
+-----------------------------------------------------------------------------------------------------+
| SYSTEM TELEMETRY MONITOR (ALL ACTIVE OUTLETS)                                                       |
| +-------------------------------------------------------------------------------------------------+ |
| |  METRIC SUMMARY: NET TODAY ($8,450.00) | OPEN TICKETS: 14 | VOIDS: 2 | DISCOUNTS APPLIED: $120   | |
| +-------------------------------------------------------------------------------------------------+ |
|                                                                                                     |
| ACTIVE OUTLET OVERVIEW GRID                                                                         |
| +----------------------------------+ +----------------------------------+ +-----------------------+ |
| | DOWNTOWN BRANCH (OUTLET #01)     | | LAKESIDE CAFE (OUTLET #02)       | | INVENTORY STOCK-LEVEL | |
| | Status: Active | Active Orders: 8| | Status: Active | Active Orders: 6| | -- Whole Milk: 12L    | |
| | Current Gross Today: $4,200.00   | | Current Gross Today: $4,250.00   | |    [LOW STOCK ALERT]  | |
| | Voids Logged: 0                  | | Voids Logged: 2 (Requires Audit) | | -- Coffee Beans: 45kg | |
| +----------------------------------+ +----------------------------------+ +-----------------------+ |
|                                                                                                     |
| DSR REAL-TIME CONSOLIDATED ANALYTICS INTERFACE                                                      |
| +-------------------------------------------------------------------------------------------------+ |
| | HOUR RANGE     SALES REVENUE    TICKET VALUE COUNT    TOP FULFILLMENT CHANNEL                   | |
| | 07AM - 09AM    $2,450.00        210 Items             Walk-In Dine-In (65%)                     | |
| | 09AM - 11AM    $3,800.00        340 Items             Online Aggregator Delivery (58%)          | |
| +-------------------------------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------------------------+
```

* **Design Constraints & Aesthetics:**
    * **Structure & Visual Layout:** Built via high-density structural layouts utilizing explicit pixel positioning and grid table layouts. Responsive frameworks scale down cleanly to 13-inch laptop viewports while providing maximum data visibility for operators.
    * **Theme Control Capabilities:** Integrated toggle framework switching between a sleek dark slate background canvas (`#0F172A`) for reduced eye strain during late-night monitoring, and a high-contrast standard light mode environment (`#F8FAFC`).
    * **Data Presentation Layer:** Real-time data tables utilize fixed column width formatting, structured text limits, and auto-scrolling log sheets to display fast-moving transactional rows with clean visibility.

---

## SECTION 4: Kitchen Display System (KDS) & Token Tracking Frameworks

### 4.1 Kitchen Display System (KDS) Dynamic Workflow
1. When a transaction ticket or KOT is fired from any terminal, the system updates the KDS pipeline queue.
2. The KDS rendering screen populates a new order block card, initiating an automated extraction count timer.
3. **Color-Coded Urgency Matrix Transitions:**
    * **Standard State (0.00 - 3.00 minutes):** Renders with a subtle charcoal border backdrop (`#2C3E50`).
    * **Warning Milestone (3.01 - 5.00 minutes):** Shifts border accents to a clear alert amber (`#F39C12`).
    * **Critical Threshold Violation (> 5.00 minutes):** Flashes a high-visibility crimson red container block (`#C0392B`) to catch the operator's eye.
4. When preparation finishes, the expeditor clicks the clear interface block trigger, pushing a structural message back to the Master POS node updating the fulfillment state index.

### 4.2 Automated Token Queue Architecture
1. Upon taking an order, the terminal prints or displays a sequential identification token string (e.g., Token #045).
2. The order information populates the Token Management Monitor, which splits into two visible arrays: **Orders Currently Processing** and **Orders Ready for Pickup**.
3. When the KDS dispatcher marks an active order card as cleared, the token identifier shifts instantly from the processing layout bucket into the high-contrast ready viewport, accompanied by an optional audio chime notification to alert waiting customers.

---

## SECTION 5: Comprehensive Analytical Report Catalog (60+ Structural Engines)

The Analytics Architecture compiles over 60 granular reports into four core modules within the Back-Office Engine. The matrix below defines the primary structural report configurations required for enterprise system deployment.

| Report Class ID | Core Report Module Title | Target Extraction Telemetry Metrics | Operational Strategic Objective |
| :--- | :--- | :--- | :--- |
| **REP-MOD-01** | Daily Sales Summary (DSR) | Gross/Net income, tax allocation brackets, checkout mode distributions. | Audits baseline revenue velocity at daily closures. |
| **REP-MOD-02** | Hourly Transaction Density | Transaction frequencies, average check values mapped against hourly slots. | Guides labor shift scheduling models to match traffic peaks. |
| **REP-MOD-03** | Menu Matrix Engineering | Item sales volumes matched against item-level margin values. | Segregates profitable menu items from low-margin items. |
| **REP-MOD-04** | Customer Lifetime Value (LTV) | Aggregated guest visit volumes, average spend matrices, coupon redemptions. | Empowers marketing teams to launch targeted retention campaigns. |
| **REP-MOD-05** | Inventory Variance Audit | Theoretical raw stock drawdowns vs. physical item inventory volumes. | Exposes kitchen waste and material shrinkage footprints. |
| **REP-MOD-06** | Labor-to-Revenue Alignment | Real-time hourly payroll expenses mapped against active hourly sales. | Monitors operational cost efficiencies to prevent over-staffing waste. |
| **REP-MOD-07** | Payment Channel Clearance | Transaction processing logs broken down by specific card/digital gateway. | Reconciles bank account deposits against digital ledger balances. |
| **REP-MOD-08** | Order Void & Cancellation Audit | Void item rows, cancellation reason text, supervisor passcode IDs. | Restricts checkout floor fraud and internal theft behaviors. |
| **REP-MOD-09** | Multi-Branch Analytics Grid | Cross-location performance metrics, growth rates, and baseline targets. | Provides corporate headquarters visibility into branch performance. |
| **REP-MOD-10** | Table Turn Velocity | Seating timestamps matched against checkout settlement time stamps. | Optimizes dining floor performance and seat distribution logic. |
