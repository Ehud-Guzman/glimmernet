require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Bundle = require('../models/Bundle');

const bundles = [
  // Time-based
  {
    name: '1 Hour',
    price: 20,
    durationMinutes: 60,
    dataMB: null,
    speedLimitMbps: 2,
    mikrotikProfile: 'plan_1hr',
  },
  {
    name: '3 Hours',
    price: 50,
    durationMinutes: 180,
    dataMB: null,
    speedLimitMbps: 3,
    mikrotikProfile: 'plan_3hr',
  },
  {
    name: 'Daily (24 hrs)',
    price: 100,
    durationMinutes: 1440,
    dataMB: null,
    speedLimitMbps: 4,
    mikrotikProfile: 'plan_24hr',
  },
  {
    name: 'Weekly (7 days)',
    price: 450,
    durationMinutes: 10080,
    dataMB: null,
    speedLimitMbps: 5,
    mikrotikProfile: 'plan_weekly',
  },
  {
    name: 'Monthly (30 days)',
    price: 1500,
    durationMinutes: 43200,
    dataMB: null,
    speedLimitMbps: 5,
    mikrotikProfile: 'plan_monthly',
  },
  // Data-based
  {
    name: '500 MB',
    price: 30,
    durationMinutes: null,
    dataMB: 500,
    speedLimitMbps: 3,
    mikrotikProfile: 'plan_500mb',
  },
  {
    name: '1 GB',
    price: 60,
    durationMinutes: null,
    dataMB: 1024,
    speedLimitMbps: 4,
    mikrotikProfile: 'plan_1gb',
  },
  {
    name: '2 GB',
    price: 100,
    durationMinutes: null,
    dataMB: 2048,
    speedLimitMbps: 5,
    mikrotikProfile: 'plan_2gb',
  },
];

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  let created = 0;
  let skipped = 0;

  for (const b of bundles) {
    const exists = await Bundle.findOne({ name: b.name });
    if (exists) {
      console.log(`  SKIP  ${b.name} (already exists)`);
      skipped++;
    } else {
      await Bundle.create(b);
      console.log(`  OK    ${b.name} — KES ${b.price}`);
      created++;
    }
  }

  console.log(`\nDone. ${created} created, ${skipped} skipped.`);
  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
