#!/usr/bin/env node
/**
 * Acquisition Metrics Template Generator
 * Generates a personalized .xlsx tracking template based on business archetype.
 *
 * Usage:
 *   node generate-template.js --name "Monzo" --archetype fintech --output ./
 *   node generate-template.js --name "Example" --archetype lead-to-sale --sub-variant local --output ./
 */

const ExcelJS = require('exceljs');
const path = require('path');

// --- KPI tiering (SAN-296) ---
//
// Every generated KPI carries a `tier` so the dashboard Overview can group them
// the way a CMO reads a scorecard:
//   - primary  → the North Star / activation KPI (the one number that matters)
//   - leading  → upstream demand & funnel-mid signals that PREDICT the North Star
//                (traffic, SEO reach, ad clicks, funnel step-conversion, social/outreach)
//   - lagging  → cost, quality & efficiency outcomes that CONFIRM it after the fact
//                (CAC/CPL, spend, value metric like GMV/AOV/Deal Size, ROAS)
//
// `TIER_BY_CATEGORY` is the single source of truth (consumed by generate-plan.js
// via the same eval bridge that reads ARCHETYPES). Categories not listed default
// to "leading" (an upstream signal until proven otherwise).
const TIER_BY_CATEGORY = {
  funnel: 'leading',
  traffic: 'leading',
  seo: 'leading',
  paid: 'leading',
  social: 'leading',
  outreach: 'leading',
  crm: 'leading',
  efficiency: 'lagging',
  cost: 'lagging',
  value: 'lagging',
  quality: 'lagging',
  primary: 'primary',
};

// --- Archetype Configurations ---

const ARCHETYPES = {
  'saas-app': {
    label: 'SaaS / App',
    activationEvent: 'Core Feature Used',
    funnelSteps: ['Visits/Installs', 'Signups', 'Onboarding Complete', 'Core Feature Used', 'Paid/D7 Return'],
    primaryKPI: 'Core Feature Used',
    channels: [
      { group: 'Paid SRN', name: 'Google Ads' },
      { group: 'Paid SRN', name: 'Meta Ads' },
      { group: 'Paid SRN', name: 'Apple Search Ads' },
      { group: 'Organic', name: 'Organic' },
      { group: 'Brand', name: 'Blog / Content' },
      { group: 'Brand', name: 'Social Media' },
      { group: 'Referral', name: 'Referral Program' },
      { group: 'Affiliates', name: '[Partner name]' },
    ],
    valueMetric: { name: 'MRR per User', formula: 'subscription price', tier: 'lagging' },
    benchmarks: { activationRate: '15-30%', cacPayback: '6-12 months', ltvCac: '>3x' },
    dataSources: [
      { metric: 'Web Traffic', source: 'PostHog / GA4', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Product Usage', source: 'PostHog / Amplitude', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Signups', source: 'PostHog / Internal DB', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Feature Usage', source: 'PostHog / Amplitude', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Paid Spend', source: 'Google Ads / Meta', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Revenue / MRR', source: 'Stripe / Billing', method: 'api-auto', frequency: 'Daily' },
      { metric: 'SEO Performance', source: 'Google Search Console', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Social Engagement', source: 'Metricool', method: 'api-auto', frequency: 'Daily' },
    ],
  },
  fintech: {
    label: 'Fintech',
    activationEvent: 'First Transaction',
    funnelSteps: ['Downloads', 'Signups', 'KYC Completed', 'First Deposit', 'First Transaction'],
    primaryKPI: 'First Transaction',
    channels: [
      { group: 'Affiliates', name: '[Partner name]' },
      { group: 'Paid SRN', name: 'Google Ads' },
      { group: 'Paid SRN', name: 'Meta Ads' },
      { group: 'Paid SRN', name: 'TikTok Ads' },
      { group: 'Paid SRN', name: 'Apple Search Ads' },
      { group: 'Organic', name: 'Organic' },
      { group: 'Brand', name: 'Blog' },
      { group: 'Brand', name: 'Social Media' },
      { group: 'Referral', name: 'Referral Program' },
      { group: 'Offline', name: 'Events' },
    ],
    valueMetric: { name: 'Amount Deposited', formula: 'total EUR deposited', tier: 'lagging' },
    benchmarks: { activationRate: '20-25%', cacPayback: '3-6 months', ltvCac: '>4x' },
    dataSources: [
      { metric: 'Downloads / Installs', source: 'AppsFlyer / App Store', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Signups', source: 'Internal DB', method: 'api-auto', frequency: 'Daily' },
      { metric: 'KYC Completed', source: 'Internal DB / KYC Provider', method: 'api-auto', frequency: 'Daily' },
      { metric: 'First Transaction', source: 'Internal DB', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Amount Deposited', source: 'Internal DB', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Web Traffic', source: 'GA4', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Paid Spend', source: 'Google Ads / Meta / TikTok', method: 'api-auto', frequency: 'Daily' },
      { metric: 'SEO Performance', source: 'Google Search Console', method: 'api-auto', frequency: 'Daily' },
    ],
  },
  marketplace: {
    label: 'Marketplace',
    activationEvent: 'First Transaction',
    funnelSteps: ['Visits', 'Signups', 'First Listing/Search', 'First Transaction'],
    primaryKPI: 'First Transaction',
    channels: [
      { group: 'Paid SRN', name: 'Google Ads' },
      { group: 'Paid SRN', name: 'Meta Ads' },
      { group: 'Organic', name: 'Organic SEO' },
      { group: 'Brand', name: 'Content / Blog' },
      { group: 'Brand', name: 'Social Media' },
      { group: 'Referral', name: 'Referral Program' },
      { group: 'Affiliates', name: '[Partner name]' },
      { group: 'Offline', name: 'Events' },
    ],
    valueMetric: { name: 'GMV', formula: 'transaction value', tier: 'lagging' },
    benchmarks: { activationRate: '10-20%', cacPayback: 'Variable', ltvCac: '>3x' },
    dataSources: [
      { metric: 'Web Traffic', source: 'GA4 / PostHog', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Signups', source: 'Internal DB', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Transactions', source: 'Internal DB', method: 'api-auto', frequency: 'Daily' },
      { metric: 'GMV', source: 'Internal DB', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Paid Spend', source: 'Google Ads / Meta', method: 'api-auto', frequency: 'Daily' },
      { metric: 'SEO Performance', source: 'Google Search Console', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Social Engagement', source: 'Metricool', method: 'api-auto', frequency: 'Daily' },
    ],
  },
  'ecommerce-d2c': {
    label: 'E-commerce / D2C',
    activationEvent: 'First Purchase',
    funnelSteps: ['Visits', 'Add to Cart', 'Checkout Started', 'Purchase'],
    primaryKPI: 'Purchases',
    channels: [
      { group: 'Paid SRN', name: 'Google Ads' },
      { group: 'Paid SRN', name: 'Meta Ads' },
      { group: 'Paid SRN', name: 'TikTok Ads' },
      { group: 'Organic', name: 'Organic SEO' },
      { group: 'Brand', name: 'Social Media' },
      { group: 'Brand', name: 'Email Marketing' },
      { group: 'Affiliates', name: '[Affiliate name]' },
      { group: 'Referral', name: 'Referral Program' },
    ],
    valueMetric: { name: 'AOV', formula: 'average order value', tier: 'lagging' },
    benchmarks: { activationRate: '2-5%', cacPayback: 'Immediate-3m', ltvCac: '>3x' },
    dataSources: [
      { metric: 'Web Traffic', source: 'GA4', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Orders / Purchases', source: 'Shopify / WooCommerce', method: 'api-auto', frequency: 'Daily' },
      { metric: 'AOV', source: 'Shopify / WooCommerce', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Cart Abandonment', source: 'GA4 / Shopify', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Paid Spend', source: 'Google Ads / Meta / TikTok', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Email Performance', source: 'Klaviyo / Mailchimp', method: 'api-auto', frequency: 'Daily' },
      { metric: 'SEO Performance', source: 'Google Search Console', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Social Engagement', source: 'Metricool', method: 'api-auto', frequency: 'Daily' },
    ],
  },
  'lead-to-sale': {
    label: 'Lead-to-Sale',
    activationEvent: 'Qualified Meeting',
    funnelSteps: ['Contacts', 'Leads', 'Qualified Leads', 'Meetings/Demos', 'Proposals', 'Deals'],
    primaryKPI: 'Qualified Meetings',
    channels: [
      { group: 'Paid SRN', name: 'Google Ads' },
      { group: 'Paid SRN', name: 'Meta Ads' },
      { group: 'Paid SRN', name: 'LinkedIn Ads' },
      { group: 'Organic', name: 'Organic SEO' },
      { group: 'Brand', name: 'Content / Blog' },
      { group: 'Brand', name: 'Social Media' },
      { group: 'Referral', name: 'Referral Partners' },
      { group: 'Offline', name: 'Events / Networking' },
    ],
    valueMetric: { name: 'Deal Size', formula: 'average deal value', tier: 'lagging' },
    benchmarks: { activationRate: '10-25%', cacPayback: '1-6 months', ltvCac: '>3x' },
    dataSources: [
      { metric: 'Web Traffic', source: 'GA4', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Leads / Contacts', source: 'CRM / Google Sheets', method: 'api-auto / manual', frequency: 'Daily' },
      { metric: 'Meetings / Demos', source: 'CRM / Calendar', method: 'manual', frequency: 'Weekly' },
      { metric: 'Proposals', source: 'CRM / Google Sheets', method: 'manual', frequency: 'Weekly' },
      { metric: 'Deals / Revenue', source: 'CRM / Stripe / Sheets', method: 'manual', frequency: 'Monthly' },
      { metric: 'Outbound Activity', source: 'Instantly / Lemlist', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Paid Spend', source: 'Google Ads / LinkedIn Ads', method: 'api-auto', frequency: 'Daily' },
      { metric: 'SEO Performance', source: 'Google Search Console', method: 'api-auto', frequency: 'Daily' },
      { metric: 'Social Engagement', source: 'Metricool', method: 'api-auto', frequency: 'Daily' },
    ],
  },
};

// Sub-variant overrides for Lead-to-Sale
const LEAD_TO_SALE_VARIANTS = {
  local: {
    label: 'Local Services',
    funnelSteps: ['Searches/Visits', 'Calls/Forms', 'Appointments', 'First Visits', 'Treatments/Services'],
    activationEvent: 'First Visit/Consultation',
    primaryKPI: 'First Visits',
    channelOverrides: [
      { group: 'Organic', name: 'Google Business Profile' },
      { group: 'Organic', name: 'Local SEO' },
      { group: 'Paid SRN', name: 'Google Ads (Local)' },
      { group: 'Paid SRN', name: 'Meta Ads (Geo-targeted)' },
      { group: 'Directories', name: 'Doctoralia / Sector Directory' },
      { group: 'Referral', name: 'Word of Mouth' },
      { group: 'Referral', name: 'Referral Partners' },
      { group: 'Offline', name: 'Local Events' },
    ],
  },
  enterprise: {
    label: 'SaaS Enterprise',
    funnelSteps: ['MQLs', 'SQLs', 'Demos', 'Proposals', 'Closed Won'],
    activationEvent: 'Demo Completed',
    primaryKPI: 'Demos',
    channelOverrides: [
      { group: 'Paid SRN', name: 'LinkedIn Ads' },
      { group: 'Paid SRN', name: 'Google Ads' },
      { group: 'Outbound', name: 'SDR Outbound' },
      { group: 'Outbound', name: 'Cold Email' },
      { group: 'Brand', name: 'Content / Webinars' },
      { group: 'Partnerships', name: 'Channel Partners' },
      { group: 'Offline', name: 'Conferences / Events' },
      { group: 'Referral', name: 'Customer Referrals' },
    ],
  },
  b2b: {
    label: 'B2B Services',
    funnelSteps: ['Leads', 'Meetings', 'Proposals', 'Deals'],
    activationEvent: 'First Meeting',
    primaryKPI: 'Meetings',
    channelOverrides: [
      { group: 'Organic', name: 'LinkedIn Organic' },
      { group: 'Paid SRN', name: 'LinkedIn Ads' },
      { group: 'Outbound', name: 'Cold Email' },
      { group: 'Outbound', name: 'Networking' },
      { group: 'Brand', name: 'Content / Blog' },
      { group: 'Referral', name: 'Referral Partners' },
      { group: 'Offline', name: 'Events' },
      { group: 'Organic', name: 'SEO' },
    ],
  },
};

// --- Style constants ---
const COLORS = {
  headerBg: 'FF2C3E50',
  headerFont: 'FFFFFFFF',
  subHeaderBg: 'FF3498DB',
  lightBg: 'FFEAF2F8',
  borderColor: 'FFD5D8DC',
  greenBg: 'FFE8F8F5',
  yellowBg: 'FFFEF9E7',
};

function applyHeaderStyle(row) {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.font = { bold: true, color: { argb: COLORS.headerFont }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: COLORS.borderColor } },
    };
  });
  row.height = 30;
}

function applySubHeaderStyle(row) {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeaderBg } };
    cell.font = { bold: true, color: { argb: COLORS.headerFont }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
}

// --- Sheet Builders ---

function buildTotalExpenseSheet(wb, config) {
  const ws = wb.addWorksheet('Total Expense');

  // Build columns based on funnel steps
  const baseColumns = [
    { header: 'MonthYear', key: 'monthYear', width: 14 },
    { header: 'Channel Group', key: 'channelGroup', width: 16 },
    { header: 'Channel', key: 'channel', width: 22 },
    { header: 'Fixed Payment', key: 'fixedPayment', width: 14 },
    { header: 'VAT', key: 'vat', width: 10 },
    { header: 'Variable Fee', key: 'variableFee', width: 13 },
    { header: 'Variable Total', key: 'variableTotal', width: 14 },
    { header: 'Total Spend', key: 'totalSpend', width: 13 },
  ];

  // Add funnel step columns
  const funnelCols = config.funnelSteps.map((step, i) => ({
    header: `# ${step}`,
    key: `funnel_${i}`,
    width: 16,
  }));

  // Add value metric column
  const valueCols = [
    { header: config.valueMetric.name, key: 'valueMetric', width: 16 },
  ];

  // Add calculated columns
  const calcCols = [
    { header: `CAC (${config.primaryKPI})`, key: 'cac', width: 16 },
    { header: 'Activation Rate', key: 'activationRate', width: 15 },
    { header: `${config.valueMetric.name}/User`, key: 'valuePerUser', width: 16 },
    { header: 'ARPU (Est. Annual)', key: 'arpu', width: 16 },
  ];

  ws.columns = [...baseColumns, ...funnelCols, ...valueCols, ...calcCols];

  // Style header
  applyHeaderStyle(ws.getRow(1));

  // Add example rows with formulas for each channel per month
  const months = ['Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025'];
  let rowNum = 2;

  for (const month of months) {
    for (const ch of config.channels) {
      const row = ws.getRow(rowNum);
      row.getCell('monthYear').value = month;
      row.getCell('channelGroup').value = ch.group;
      row.getCell('channel').value = ch.name;
      row.getCell('fixedPayment').value = 0;
      row.getCell('fixedPayment').numFmt = '#,##0';
      row.getCell('vat').numFmt = '#,##0';
      row.getCell('variableFee').value = 0;
      row.getCell('variableFee').numFmt = '#,##0.00';
      row.getCell('totalSpend').numFmt = '#,##0';

      // Funnel step cells
      config.funnelSteps.forEach((_, i) => {
        row.getCell(`funnel_${i}`).value = 0;
        row.getCell(`funnel_${i}`).numFmt = '#,##0';
      });

      row.getCell('valueMetric').numFmt = '#,##0';
      row.getCell('cac').numFmt = '#,##0.0';
      row.getCell('activationRate').numFmt = '0.0%';
      row.getCell('valuePerUser').numFmt = '#,##0';
      row.getCell('arpu').numFmt = '#,##0';

      // VAT formula: =D{row}*0.21
      const vatCol = 5; // E
      row.getCell(vatCol).value = { formula: `D${rowNum}*0.21` };

      // Variable Total: =F{row}*{activation column}
      const activationColIndex = 8 + config.funnelSteps.length - 1; // last funnel step = activation
      const activationColLetter = getColLetter(activationColIndex + 1);
      row.getCell(7).value = { formula: `F${rowNum}*${activationColLetter}${rowNum}` };

      // Total Spend: =D+E+G
      row.getCell(8).value = { formula: `D${rowNum}+E${rowNum}+G${rowNum}` };

      // CAC: =H/activation (if activation > 0)
      const cacColIndex = 8 + config.funnelSteps.length + 1 + 1; // after value metric
      row.getCell('cac').value = { formula: `IF(${activationColLetter}${rowNum}>0,H${rowNum}/${activationColLetter}${rowNum},0)` };

      // Activation Rate: =activation/first funnel step (if > 0)
      const firstFunnelLetter = getColLetter(9); // I = first funnel step
      row.getCell('activationRate').value = { formula: `IF(${firstFunnelLetter}${rowNum}>0,${activationColLetter}${rowNum}/${firstFunnelLetter}${rowNum},0)` };

      // Alternate row shading
      if (rowNum % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightBg } };
        });
      }

      rowNum++;
    }
  }

  // Freeze header row and first 3 columns
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];

  return ws;
}

function buildDashboardSheet(wb, config) {
  const ws = wb.addWorksheet('Dashboard');

  // Instructions
  ws.getCell('A1').value = 'ACQUISITION METRICS DASHBOARD';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: COLORS.headerBg } };

  ws.getCell('A3').value = `Business: ${config.businessName}`;
  ws.getCell('A3').font = { bold: true, size: 12 };
  ws.getCell('A4').value = `Archetype: ${config.label}`;
  ws.getCell('A5').value = `Activation Event: ${config.activationEvent}`;
  ws.getCell('A6').value = `Primary KPI: ${config.primaryKPI}`;

  // Benchmarks section
  ws.getCell('A8').value = 'BENCHMARKS';
  ws.getCell('A8').font = { bold: true, size: 14, color: { argb: COLORS.headerBg } };

  const benchRows = [
    ['Metric', 'Target', 'Current', 'Status'],
    ['Activation Rate', config.benchmarks.activationRate, '', ''],
    ['CAC Payback', config.benchmarks.cacPayback, '', ''],
    ['LTV/CAC Ratio', config.benchmarks.ltvCac, '', ''],
  ];
  benchRows.forEach((data, i) => {
    const row = ws.getRow(9 + i);
    data.forEach((val, j) => { row.getCell(j + 1).value = val; });
    if (i === 0) applySubHeaderStyle(row);
  });

  // Metrics hierarchy
  ws.getCell('A15').value = 'METRICS HIERARCHY';
  ws.getCell('A15').font = { bold: true, size: 14, color: { argb: COLORS.headerBg } };

  const hierRows = [
    ['Level', 'Metric', 'Formula', 'Frequency'],
    ['L1 - Primary', `# ${config.primaryKPI}`, 'Count from Total Expense', 'Weekly'],
    ['L2 - Quality', 'Activation Rate', `${config.primaryKPI} / ${config.funnelSteps[0]}`, 'Weekly'],
    ['L2 - Quality', 'CAC', `Total Spend / ${config.primaryKPI}`, 'Monthly'],
    ['L2 - Quality', config.valueMetric.name, config.valueMetric.formula, 'Monthly'],
    ['L3 - Funnel', 'Step Conversion Rates', config.funnelSteps.join(' -> '), 'Weekly'],
    ['L4 - Return', 'LTV/CAC', 'LTV / CAC', 'Quarterly'],
    ['L4 - Return', 'ROAS', 'Revenue / Spend', 'Monthly'],
    ['L4 - Return', 'Payback Period', 'CAC / Monthly ARPU', 'Quarterly'],
  ];
  hierRows.forEach((data, i) => {
    const row = ws.getRow(16 + i);
    data.forEach((val, j) => { row.getCell(j + 1).value = val; });
    if (i === 0) applySubHeaderStyle(row);
  });

  // Review cadence
  ws.getCell('A27').value = 'REVIEW CADENCE';
  ws.getCell('A27').font = { bold: true, size: 14, color: { argb: COLORS.headerBg } };

  const cadenceRows = [
    ['Frequency', 'What to Review', 'Action'],
    ['Weekly', `${config.primaryKPI} + Activation Rate by channel`, 'Kill bad channels, double down on good ones'],
    ['Weekly', 'Funnel step-by-step conversion', 'Diagnose bottlenecks'],
    ['Monthly', 'CAC per channel + ARPU', 'Reallocate budget'],
    ['Monthly', 'Share of Search', 'Track brand awareness trend'],
    ['Quarterly', 'Cohort analysis (transaction-based)', 'Validate channel quality'],
    ['Quarterly', 'LTV/CAC + Payback Period', 'Recalibrate benchmarks'],
  ];
  cadenceRows.forEach((data, i) => {
    const row = ws.getRow(28 + i);
    data.forEach((val, j) => { row.getCell(j + 1).value = val; });
    if (i === 0) applySubHeaderStyle(row);
  });

  // Column widths
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 35;
  ws.getColumn(3).width = 40;
  ws.getColumn(4).width = 20;

  return ws;
}

function buildAttributionSheet(wb, config) {
  const ws = wb.addWorksheet('Attribution');

  ws.getCell('A1').value = 'CHANNEL ATTRIBUTION GUIDE';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: COLORS.headerBg } };

  const headerRow = ws.getRow(3);
  ['Channel Group', 'Channel/Source', 'UTM Example'].forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  applySubHeaderStyle(headerRow);

  let rowNum = 4;
  for (const ch of config.channels) {
    const row = ws.getRow(rowNum);
    row.getCell(1).value = ch.group;
    row.getCell(2).value = ch.name;
    row.getCell(3).value = `utm_source=${ch.group.toLowerCase().replace(/\s+/g, '_')}&utm_medium=${ch.name.toLowerCase().replace(/[\s\/]+/g, '_')}`;
    rowNum++;
  }

  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 60;

  return ws;
}

function buildCohortSheet(wb, config) {
  const ws = wb.addWorksheet('Cohorts');

  ws.getCell('A1').value = `RETENTION COHORTS (from ${config.activationEvent})`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: COLORS.headerBg } };

  ws.getCell('A3').value = 'Paste cohort data below. Start event = activation event, NOT signup.';
  ws.getCell('A3').font = { italic: true, color: { argb: 'FF7F8C8D' } };

  // Cohort template headers
  const headers = ['Activation Month', 'Users', 'M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'];
  const headerRow = ws.getRow(5);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  applyHeaderStyle(headerRow);

  // Add month placeholders
  const months = ['Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025',
    'Jul 2025', 'Aug 2025', 'Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025'];
  months.forEach((m, i) => {
    ws.getRow(6 + i).getCell(1).value = m;
  });

  // Percentage cohort section
  ws.getCell('A20').value = 'RETENTION % (auto-calculated)';
  ws.getCell('A20').font = { bold: true, size: 12, color: { argb: COLORS.headerBg } };

  const pctHeaderRow = ws.getRow(21);
  headers.forEach((h, i) => { pctHeaderRow.getCell(i + 1).value = h; });
  applySubHeaderStyle(pctHeaderRow);

  // Add formulas for percentage
  months.forEach((m, i) => {
    const dataRow = 6 + i;
    const pctRow = 22 + i;
    ws.getRow(pctRow).getCell(1).value = m;
    // M0-M11 percentages
    for (let j = 0; j < 12; j++) {
      const colLetter = getColLetter(j + 3); // C onwards
      ws.getRow(pctRow).getCell(j + 3).value = {
        formula: `IF(B${dataRow}>0,${colLetter}${dataRow}/B${dataRow},0)`,
      };
      ws.getRow(pctRow).getCell(j + 3).numFmt = '0.0%';
    }
  });

  // Revenue cohort section
  ws.getCell('A36').value = 'REVENUE COHORT (paste revenue per cohort)';
  ws.getCell('A36').font = { bold: true, size: 12, color: { argb: COLORS.headerBg } };

  const revHeaders = ['Activation Month', 'Investment', 'M0 Rev', 'M1 Rev', 'M2 Rev', 'M3 Rev', 'M4 Rev', 'M5 Rev', 'M6 Rev', 'Cumul. Rev', 'ROAS', 'Payback Month'];
  const revHeaderRow = ws.getRow(37);
  revHeaders.forEach((h, i) => { revHeaderRow.getCell(i + 1).value = h; });
  applySubHeaderStyle(revHeaderRow);

  months.forEach((m, i) => {
    const row = ws.getRow(38 + i);
    row.getCell(1).value = m;
    // Cumulative Revenue formula: SUM(C:I)
    row.getCell(10).value = { formula: `SUM(C${38 + i}:I${38 + i})` };
    row.getCell(10).numFmt = '#,##0';
    // ROAS: Cumul Rev / Investment
    row.getCell(11).value = { formula: `IF(B${38 + i}>0,J${38 + i}/B${38 + i},0)` };
    row.getCell(11).numFmt = '0.0x';
  });

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 14;
  for (let i = 3; i <= 14; i++) ws.getColumn(i).width = 12;

  return ws;
}

function buildDataSourcesSheet(wb, config) {
  const ws = wb.addWorksheet('Data Sources');

  ws.getCell('A1').value = 'DATA SOURCE MAPPING';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: COLORS.headerBg } };

  ws.getCell('A3').value = 'Maps each metric to its data source, collection method, and update frequency.';
  ws.getCell('A3').font = { italic: true, color: { argb: 'FF7F8C8D' } };

  const headers = ['Metric', 'Source Tool', 'Collection Method', 'Frequency', 'Owner', 'Status'];
  const headerRow = ws.getRow(5);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  applyHeaderStyle(headerRow);

  const sources = config.dataSources || [];
  sources.forEach((src, i) => {
    const row = ws.getRow(6 + i);
    row.getCell(1).value = src.metric;
    row.getCell(2).value = src.source;
    row.getCell(3).value = src.method;
    row.getCell(4).value = src.frequency;
    row.getCell(5).value = ''; // Owner - to be filled
    row.getCell(6).value = 'Not connected';
    row.getCell(6).font = { color: { argb: 'FFE74C3C' } };
    if (i % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightBg } };
      });
    }
  });

  // Calculated metrics section
  const calcStart = 6 + sources.length + 2;
  ws.getCell(`A${calcStart}`).value = 'CALCULATED METRICS (auto-derived)';
  ws.getCell(`A${calcStart}`).font = { bold: true, size: 12, color: { argb: COLORS.headerBg } };

  const calcHeaderRow = ws.getRow(calcStart + 1);
  ['Metric', 'Formula', 'Inputs', 'Frequency'].forEach((h, i) => {
    calcHeaderRow.getCell(i + 1).value = h;
  });
  applySubHeaderStyle(calcHeaderRow);

  const calcMetrics = [
    ['Activation Rate', `${config.primaryKPI} / ${config.funnelSteps[0]}`, `${config.primaryKPI}, ${config.funnelSteps[0]}`, 'Weekly'],
    ['CAC', `Total Spend / ${config.primaryKPI}`, `Total Spend, ${config.primaryKPI}`, 'Monthly'],
    [`${config.valueMetric.name} per User`, `${config.valueMetric.name} / ${config.primaryKPI}`, `${config.valueMetric.name}, ${config.primaryKPI}`, 'Monthly'],
    ['LTV/CAC Ratio', 'LTV / CAC', 'LTV, CAC', 'Quarterly'],
    ['ROAS', 'Revenue / Total Spend', 'Revenue, Total Spend', 'Monthly'],
    ['Payback Period', 'CAC / Monthly ARPU', 'CAC, ARPU', 'Quarterly'],
  ];
  calcMetrics.forEach((data, i) => {
    const row = ws.getRow(calcStart + 2 + i);
    data.forEach((val, j) => { row.getCell(j + 1).value = val; });
  });

  ws.getColumn(1).width = 25;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 25;
  ws.getColumn(4).width = 15;
  ws.getColumn(5).width = 15;
  ws.getColumn(6).width = 15;

  return ws;
}

// --- Utility ---

function getColLetter(colNum) {
  let letter = '';
  while (colNum > 0) {
    const mod = (colNum - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    colNum = Math.floor((colNum - 1) / 26);
  }
  return letter;
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.name || !args.archetype) {
    console.log(`
Usage: node generate-template.js --name "Business Name" --archetype <type> [--sub-variant <variant>] [--output <dir>]

Archetypes: saas-app, fintech, marketplace, ecommerce-d2c, lead-to-sale
Sub-variants (for lead-to-sale): local, enterprise, b2b

Examples:
  node generate-template.js --name "Monzo" --archetype fintech --output ./
  node generate-template.js --name "Example" --archetype lead-to-sale --sub-variant local --output ./
  node generate-template.js --name "Growth4U" --archetype lead-to-sale --sub-variant b2b --output ./
    `);
    process.exit(1);
  }

  const archetype = ARCHETYPES[args.archetype];
  if (!archetype) {
    console.error(`Unknown archetype: ${args.archetype}. Valid: ${Object.keys(ARCHETYPES).join(', ')}`);
    process.exit(1);
  }

  // Build config by merging archetype + sub-variant
  const config = {
    businessName: args.name,
    ...archetype,
  };

  if (args['sub-variant'] && args.archetype === 'lead-to-sale') {
    const variant = LEAD_TO_SALE_VARIANTS[args['sub-variant']];
    if (variant) {
      config.label = `${archetype.label} (${variant.label})`;
      config.funnelSteps = variant.funnelSteps;
      config.activationEvent = variant.activationEvent;
      config.primaryKPI = variant.primaryKPI;
      if (variant.channelOverrides) config.channels = variant.channelOverrides;
    }
  }

  // Generate workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Growth4U - Acquisition Metrics Plan';
  wb.created = new Date();

  buildDashboardSheet(wb, config);
  buildTotalExpenseSheet(wb, config);
  buildDataSourcesSheet(wb, config);
  buildAttributionSheet(wb, config);
  buildCohortSheet(wb, config);

  // Write file
  const outputDir = args.output || '.';
  const filename = `${args.name.replace(/\s+/g, '-')}-Acquisition-Template.xlsx`;
  const outputPath = path.join(outputDir, filename);

  await wb.xlsx.writeFile(outputPath);
  console.log(`Generated: ${outputPath}`);
  console.log(`  Archetype: ${config.label}`);
  console.log(`  Activation Event: ${config.activationEvent}`);
  console.log(`  Primary KPI: ${config.primaryKPI}`);
  console.log(`  Funnel: ${config.funnelSteps.join(' -> ')}`);
  console.log(`  Channels: ${config.channels.length}`);
  console.log(`  Sheets: Dashboard, Total Expense, Data Sources, Attribution, Cohorts`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] || true;
      i++;
    }
  }
  return args;
}

main().catch(err => { console.error(err); process.exit(1); });
