import type { BenchSuite } from "../types";
import { FORMAT, makeTask, type TaskInput } from "./util";

const SUITE = "extraction";

interface ExtractionTask {
  id: string;
  category: string;
  difficulty: number;
  instructions: string;
  text: string;
  /** The correct JSON object. Every key is required and every value is checked. */
  answer: Record<string, unknown>;
}

const RULES =
  "Use null for anything not stated. Write numbers as plain JSON numbers (no currency symbols, units or thousands separators). Write dates as YYYY-MM-DD and times as 24-hour HH:MM.";

const TASKS: ExtractionTask[] = [
  {
    id: "contact-card",
    category: "contact",
    difficulty: 0.2,
    instructions:
      'Extract the person\'s contact details into a JSON object with keys "name", "email", "phone" (digits only) and "city".',
    text: "hey!! it's Jordan Lee btw — best way to reach me is jordan.lee@example.com, or call/text (555) 013-2277. I moved to Denver last spring so I'm on Mountain time now.",
    answer: { name: "Jordan Lee", email: "jordan.lee@example.com", phone: "5550132277", city: "Denver" },
  },
  {
    id: "address",
    category: "contact",
    difficulty: 0.25,
    instructions:
      'Extract the shipping address into a JSON object with keys "street", "city", "state" (2-letter code) and "zip" (as a string).',
    text: "Order #4471 — gift wrap please!! Ship to: 742 Evergreen Terrace, Springfield, OR 97477. Billing address is the same. Leave at back door if nobody answers.",
    answer: { street: "742 Evergreen Terrace", city: "Springfield", state: "OR", zip: "97477" },
  },
  {
    id: "review-rating",
    category: "review",
    difficulty: 0.3,
    instructions:
      'Extract a JSON object with keys "product" (brand/model name only, without the product type), "rating" (number of stars out of 5), "would_recommend" (boolean) and "reviewer" (string).',
    text: "★★★★☆ (4/5) — The Trailblazer 2 headlamp is bright and the battery lasts all weekend. Strap is a bit scratchy but I'd absolutely tell friends to buy it. – posted by Kenji M.",
    answer: { product: "Trailblazer 2", rating: 4, would_recommend: true, reviewer: "Kenji M." },
  },
  {
    id: "invoice",
    category: "finance",
    difficulty: 0.35,
    instructions:
      'Extract a JSON object with keys "invoice_id", "vendor", "total" (number), "currency" (ISO code) and "due_date".',
    text: "From: billing@northwind-supplies.com\nSubject: Invoice INV-A7781 (Northwind Supplies)\n\nHi, attached is invoice INV-A7781 for the March restock. Subtotal $1,150.00 plus shipping $95.50 brings the total due to $1,245.50 (USD). Payment is due by March 3, 2025. Thanks!",
    answer: { invoice_id: "INV-A7781", vendor: "Northwind Supplies", total: 1245.5, currency: "USD", due_date: "2025-03-03" },
  },
  {
    id: "dob-us-format",
    category: "records",
    difficulty: 0.4,
    instructions:
      'Extract a JSON object with keys "first_name", "last_name", "date_of_birth" and "member_id". The form uses US date order (month/day/year).',
    text: "MEMBER FORM (scanned)  last name: OKAFOR   first: Chidi   D.O.B. 07/04/1990   member no. M-00318   emergency contact: see back",
    answer: { first_name: "Chidi", last_name: "Okafor", date_of_birth: "1990-07-04", member_id: "M-00318" },
  },
  {
    id: "log-line",
    category: "logs",
    difficulty: 0.4,
    instructions:
      'Parse the log line into a JSON object with keys "timestamp" (as written), "level", "service", "timeout_ms" (number), "attempt" (number), "max_attempts" (number) and "user_id" (number).',
    text: "2024-06-01T12:03:44Z ERROR [payments] Timeout after 3000ms calling ledger (attempt 3/5) user=88123 trace=af93c1",
    answer: {
      timestamp: "2024-06-01T12:03:44Z",
      level: "ERROR",
      service: "payments",
      timeout_ms: 3000,
      attempt: 3,
      max_attempts: 5,
      user_id: 88123,
    },
  },
  {
    id: "package-missing",
    category: "logistics",
    difficulty: 0.4,
    instructions:
      'Extract a JSON object with keys "sender", "carrier", "tracking_number", "weight_kg" (number) and "signature_required" (boolean).',
    text: "Your parcel from Acme Outdoor Co. (2.4 kg) has been handed to DHL. A tracking number will be emailed once the carrier scans it. No signature is needed on delivery.",
    answer: { sender: "Acme Outdoor Co.", carrier: "DHL", tracking_number: null, weight_kg: 2.4, signature_required: false },
  },
  {
    id: "recipe",
    category: "recipe",
    difficulty: 0.4,
    instructions:
      'Extract a JSON object with keys "dish", "servings" (number), "total_minutes" (number, prep plus cooking) and "oven_celsius" (number).',
    text: "Lemon Drizzle Loaf — makes 8 slices (serves 8). Prep: 20 min. Bake: 1 hr 5 min at 180°C (160°C fan). Cool before glazing.",
    answer: { dish: "Lemon Drizzle Loaf", servings: 8, total_minutes: 85, oven_celsius: 180 },
  },
  {
    id: "meeting-move",
    category: "scheduling",
    difficulty: 0.45,
    instructions: 'Extract the NEW meeting details into a JSON object with keys "date", "time" and "room".',
    text: "Heads up: standup is moving! It was Wed 13 Nov 2024 at 9:00 in Room A, but it's now Thursday 14 November 2024 at 3:30pm in Room B. Same agenda.",
    answer: { date: "2024-11-14", time: "15:30", room: "Room B" },
  },
  {
    id: "flight-gate-change",
    category: "travel",
    difficulty: 0.45,
    instructions:
      'Extract a JSON object with keys "flight" (airline code and number without spaces), "origin" and "destination" (3-letter airport codes), "departure_time" and "gate" (the current gate).',
    text: "UPDATE for UA 2231: departs SFO 07:05, arrives ORD 13:22 (local). Gate change: was B12, now boarding from C4. Boarding begins 06:25.",
    answer: { flight: "UA2231", origin: "SFO", destination: "ORD", departure_time: "07:05", gate: "C4" },
  },
  {
    id: "job-posting",
    category: "hr",
    difficulty: 0.45,
    instructions:
      'Extract a JSON object with keys "title", "company", "salary_min" (number, USD per year), "salary_max" (number, USD per year), "remote" (boolean) and "hq_location" (city and state of the headquarters, e.g. "Boston, MA").',
    text: "We're hiring! Senior Data Engineer @ Brightline Analytics. Comp: $120k–$150k base + equity. Fully remote (US time zones); HQ is in Austin, TX but no office visits required.",
    answer: {
      title: "Senior Data Engineer",
      company: "Brightline Analytics",
      salary_min: 120000,
      salary_max: 150000,
      remote: true,
      hq_location: "Austin, TX",
    },
  },
  {
    id: "order-items",
    category: "commerce",
    difficulty: 0.5,
    instructions:
      'Extract a JSON object with keys "order_id", "items" (array of objects with keys "name" (item name without pack size) and "quantity") and "total_quantity" (number). Ignore items that were removed from the order.',
    text: "Order 55-2190 confirmed. You ordered: 3 × Ceramic Mug, 1 × French Press, 2 × Coffee Filters (100 pk). Update: we removed 1 × Milk Frother at your request. Arriving Friday.",
    answer: {
      order_id: "55-2190",
      items: [
        { name: "Ceramic Mug", quantity: 3 },
        { name: "French Press", quantity: 1 },
        { name: "Coffee Filters", quantity: 2 },
      ],
      total_quantity: 6,
    },
  },
  {
    id: "utilities-split",
    category: "legal",
    difficulty: 0.5,
    instructions:
      'For each utility, extract who pays it: one of "tenant", "landlord" or "shared". Return a JSON object with keys "water", "electricity", "gas" and "internet".',
    text: "Section 7 (Utilities). Water shall be paid by the Tenant, not the Landlord. The Landlord covers electricity. Gas charges are split 50/50 between the parties. The Tenant arranges and pays for internet service.",
    answer: { water: "tenant", electricity: "landlord", gas: "shared", internet: "tenant" },
  },
  {
    id: "grocery-quantities",
    category: "commerce",
    difficulty: 0.6,
    instructions:
      'Extract a JSON object with keys "eggs" (count of eggs), "pasta_grams" (total grams of pasta) and "apples" (count of apples).',
    text: "shopping list (don't forget!!): two dozen eggs, three 500 g packs of pasta, a bag of 6 apples plus 2 loose apples, and oat milk",
    answer: { eggs: 24, pasta_grams: 1500, apples: 8 },
  },
  {
    id: "bank-statement",
    category: "finance",
    difficulty: 0.65,
    instructions:
      'Extract a JSON object with keys "opening_balance", "closing_balance", "total_debits" (sum of money going out, as a positive number) and "largest_credit" (the single largest incoming amount). All numbers.',
    text: "Statement Jan 2025\nOpening balance: 2,310.00\n01/03 Coffee Corner      -4.50\n01/05 PAYROLL ACME     +2,850.00\n01/09 Rent             -1,400.00\n01/15 Refund Shoe Co.  +60.00\n01/21 Grocery Mart     -182.35\nClosing balance: 3,633.15",
    answer: { opening_balance: 2310, closing_balance: 3633.15, total_debits: 1586.85, largest_credit: 2850 },
  },
  {
    id: "action-items",
    category: "notes",
    difficulty: 0.7,
    instructions:
      'From these meeting notes, extract a JSON object with keys "meeting_date" and "action_items" (array of objects with keys "owner" (first name) and "due" (date)). Only include items that have both an owner and a due date. The notes are from 2025.',
    text: "Sync notes — Feb 3 2025\n- Priya to finalize the vendor contract by Feb 10.\n- Someone should look into the flaky CI job (no owner yet).\n- Marco will draft the Q2 roadmap, due Feb 14.\n- Lena owns the launch blog post; no date set.\n- Priya also sends the budget summary to finance by end of day Feb 7.",
    answer: {
      meeting_date: "2025-02-03",
      action_items: [
        { owner: "Priya", due: "2025-02-10" },
        { owner: "Marco", due: "2025-02-14" },
        { owner: "Priya", due: "2025-02-07" },
      ],
    },
  },
];

export const EXTRACTION_TASKS = TASKS;

export const extractionSuite: BenchSuite = {
  id: SUITE,
  name: "Extraction",
  description:
    "Pull structured fields out of messy text into JSON: contacts, invoices, logs, schedules with corrections, quantities that need arithmetic, and explicit nulls for missing data.",
  tasks: TASKS.map(
    (t): TaskInput => ({
      id: t.id,
      category: t.category,
      difficulty: t.difficulty,
      prompt: `${t.instructions} ${RULES}\n\nText:\n"""\n${t.text}\n"""\n\n${FORMAT.json}`,
      expected: JSON.stringify(t.answer),
      grader: { kind: "json", requiredKeys: Object.keys(t.answer), expectedValues: t.answer },
    }),
  ).map((t) => makeTask(SUITE, t)),
};
