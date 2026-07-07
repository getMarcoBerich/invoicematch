import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INVOICE_COUNT = 200;
const PAYMENT_COUNT = 160;
const OUT = path.join(__dirname, "..", "primjer-200-160.xlsx");

/** Distinct clients; some share payer identity under different bank names. */
const clients = [
  "HORWATH i HORWATH CONSULTING ZAGREB d.o.o.",
  "HORWATH CONSULTING ZAGREB d.o.o.",
  "LIVCORP d.o.o.",
  "LIVCORP ZAGREB",
  "RENT A CAR ZAGREB d.o.o.",
  "TEHNOGRAD d.o.o.",
  "ALFA STANOVANJE d.o.o.",
  "MEDIKO PLUS d.o.o.",
  "GRADITELJSTVO NOVI d.o.o.",
  "INFORMATIKA SPLIT d.o.o.",
  "VINO TRGOVINA d.o.o.",
  "AUTO SERVIS KARLOVAC d.o.o.",
  "BRODOPROJEKT d.o.o.",
  "ELEKTRO INSTAL d.o.o.",
  "FINANCIJSKO SAVJETNIŠTVO MARTIĆ d.o.o.",
  "GASTRO MARKET d.o.o.",
  "HOTEL ADRIATIK d.o.o.",
  "IT SOLUTIONS RIJEKA d.o.o.",
  "JADRANSKI TRANSPORT d.o.o.",
  "KONZALTING PARTNERI d.o.o.",
  "LOGISTIKA CENTAR d.o.o.",
  "METALOPROIZVOD d.o.o.",
  "NOVA ENERGIJA d.o.o.",
  "ODVJETNIČKI URED BABIĆ",
  "PEKARNICA KRIŽ d.o.o.",
  "RAČUNOVODSTVO TIM d.o.o.",
  "STROJARSKA OPREMA d.o.o.",
  "TURISTIČKA AGENCIJA SUN d.o.o.",
  "UNIVERZAL TRGOVINA d.o.o.",
  "VETERINARSKA STANICA d.o.o.",
  "WEB STUDIO ZAGREB d.o.o.",
  "ZELENI KROVOVI d.o.o.",
  "AGRO EXPORT SLAVONIJA d.o.o.",
  "BANKET SERVIS d.o.o.",
  "CLEAN PROFESSIONAL d.o.o.",
];

const prefixes = [
  "HQX",
  "DBA",
  "LIV",
  "RAC",
  "TEH",
  "ALF",
  "MED",
  "GRA",
  "INF",
  "VIN",
  "BRO",
  "ELK",
  "FIN",
  "GAS",
  "HOT",
  "ITR",
  "JAD",
  "KON",
  "LOG",
  "MET",
];

function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

function formatDate(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}.`;
}

function randomDate(start, end) {
  const t = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(t);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function bankClientVariant(invoiceClient) {
  const variants = {
    "HORWATH i HORWATH CONSULTING ZAGREB d.o.o.": [
      "HORWATH CONSULTING ZAGREB d.o.o.",
      "HORWATH i HORWATH CONSULTING ZAGREB d.o.o.",
    ],
    "LIVCORP d.o.o.": ["LIVCORP ZAGREB", "LIVCORP d.o.o."],
    "IT SOLUTIONS RIJEKA d.o.o.": ["IT SOLUTIONS RI d.o.o.", "IT SOLUTIONS RIJEKA d.o.o."],
    "JADRANSKI TRANSPORT d.o.o.": ["JADR TRANS d.o.o.", "JADRANSKI TRANSPORT d.o.o."],
  };
  const options = variants[invoiceClient];
  if (options && Math.random() > 0.35) return pick(options);
  return invoiceClient;
}

const invoices = [];
for (let i = 1; i <= INVOICE_COUNT; i++) {
  const client = pick(clients);
  const prefix = pick(prefixes);
  const year = 2025 + (i % 2);
  const num = `${100 + (i % 90)}/${prefix}/${year % 100}`;
  const date = randomDate(new Date(2025, 0, 1), new Date(2026, 5, 30));
  const base = round2(40 + Math.random() * 1960);
  const vat = round2(base * 0.25);
  const total = round2(base + vat);
  invoices.push({ num, date, client, base, vat, total, idx: i });
}

const payments = [];
const matchedInvoiceIndices = new Set();

const autoMatchCount = Math.floor(INVOICE_COUNT * 0.45);
for (let i = 0; i < autoMatchCount; i++) {
  const inv = invoices[(i * 3 + 7) % INVOICE_COUNT];
  if (matchedInvoiceIndices.has(invoices.indexOf(inv))) continue;
  matchedInvoiceIndices.add(invoices.indexOf(inv));
  const payDate = randomDate(inv.date, new Date(2026, 6, 1));
  const descTypes = [
    `Račun br. ${inv.num}`,
    `Ponuda ${inv.num}`,
    `UR ${inv.client.split(" ")[0]} br. ${inv.num}`,
    `Uplata računa ${inv.num}`,
  ];
  payments.push({
    date: payDate,
    amount: inv.total,
    client: bankClientVariant(inv.client),
    description: pick(descTypes),
  });
}

while (payments.length < PAYMENT_COUNT - 4) {
  const inv = pick(invoices);
  const payDate = randomDate(new Date(2025, 0, 1), new Date(2026, 6, 1));
  const sameAmount = Math.random() > 0.25;
  payments.push({
    date: payDate,
    amount: sameAmount ? inv.total : round2(50 + Math.random() * 1500),
    client:
      Math.random() > 0.4 ? bankClientVariant(inv.client) : pick(clients),
    description:
      Math.random() > 0.45
        ? `Račun br. ${inv.num}`
        : pick([
            `Uplata po ponudi ${inv.num}`,
            `Avans ${inv.client.split(" ")[0]}`,
            `Uplata ${inv.num}`,
            `Transakcija ${pick(prefixes)}-${100 + (payments.length % 50)}`,
          ]),
  });
}

payments.push({
  date: randomDate(new Date(2025, 6, 1), new Date(2026, 0, 1)),
  amount: -350.0,
  client: pick(clients),
  description: "povrat više uplaćenih sredstava",
});

payments.push({
  date: randomDate(new Date(2025, 8, 1), new Date(2026, 2, 1)),
  amount: 1200.0,
  client: pick(clients),
  description: "Avans po ugovoru br. 2025/AV-12",
});

payments.push({
  date: randomDate(new Date(2025, 3, 1), new Date(2026, 4, 1)),
  amount: 875.5,
  client: pick(clients),
  description: "Uplata bez reference na račun",
});

payments.push({
  date: randomDate(new Date(2025, 5, 1), new Date(2026, 5, 1)),
  amount: 432.18,
  client: "HORWATH CONSULTING ZAGREB d.o.o.",
  description: "Račun br. 999/HQX/25",
});

while (payments.length < PAYMENT_COUNT) {
  const inv = pick(invoices);
  payments.push({
    date: randomDate(new Date(2025, 0, 1), new Date(2026, 6, 1)),
    amount: round2(100 + Math.random() * 900),
    client: pick(clients),
    description: `Uplata ${inv.num}`,
  });
}

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("KARTICA");

ws.getCell(1, 1).value = "vinis";
ws.getCell(1, 11).value = "zaba";

const headerRow = 3;
ws.getCell(headerRow, 1).value = "Broj";
ws.getCell(headerRow, 2).value = "Datum";
ws.getCell(headerRow, 3).value = "Klijent";
ws.getCell(headerRow, 6).value = "Osnovica";
ws.getCell(headerRow, 7).value = "PDV";
ws.getCell(headerRow, 8).value = "TOTAL";
ws.getCell(headerRow, 11).value = "Datum";
ws.getCell(headerRow, 12).value = "iznos";
ws.getCell(headerRow, 13).value = "Klijent";
ws.getCell(headerRow, 14).value = "opis plaćanja";

const maxRows = Math.max(invoices.length, payments.length);
for (let r = 0; r < maxRows; r++) {
  const row = headerRow + 1 + r;
  const inv = invoices[r];
  const pay = payments[r];

  if (inv) {
    ws.getCell(row, 1).value = inv.num;
    ws.getCell(row, 2).value = formatDate(inv.date);
    ws.getCell(row, 3).value = inv.client;
    ws.getCell(row, 6).value = inv.base;
    ws.getCell(row, 7).value = inv.vat;
    ws.getCell(row, 8).value = inv.total;
  }

  if (pay) {
    ws.getCell(row, 11).value = formatDate(pay.date);
    ws.getCell(row, 12).value = pay.amount;
    ws.getCell(row, 13).value = pay.client;
    ws.getCell(row, 14).value = pay.description;
  }
}

ws.getColumn(1).width = 14;
ws.getColumn(2).width = 14;
ws.getColumn(3).width = 42;
ws.getColumn(8).width = 10;
ws.getColumn(11).width = 14;
ws.getColumn(12).width = 10;
ws.getColumn(13).width = 42;
ws.getColumn(14).width = 36;

await wb.xlsx.writeFile(OUT);
console.log(`Created ${OUT}`);
console.log(`Invoices: ${invoices.length}, Payments: ${payments.length}, Clients: ${clients.length}`);
