import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const app = express();
const port = process.env.PORT || 3000;

const requiredEnv = [
  'AIRTABLE_API_KEY',
  'AIRTABLE_BASE_ID',
  'AIRTABLE_USER_TABLE',
  'AIRTABLE_BADGE_TABLE',
  'AIRTABLE_ASSIGNMENT_TABLE',
];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.warn(
    `Missing env vars: ${missingEnv.join(', ')}. The API will return 500 until they are set.`,
  );
}

const base =
  process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID
    ? new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID)
    : null;

const tableNames = {
  users: process.env.AIRTABLE_USER_TABLE || 'Users',
  badges: process.env.AIRTABLE_BADGE_TABLE || 'Badges',
  assignments: process.env.AIRTABLE_ASSIGNMENT_TABLE || 'AssignedBadges',
};

const fields = {
  assignmentUser: process.env.AIRTABLE_ASSIGN_USER_FIELD || 'UserId', 
  assignmentSession: process.env.AIRTABLE_ASSIGN_SESSION_FIELD || 'SessionId',
  assignmentBadgeLink: process.env.AIRTABLE_ASSIGN_BADGE_LINK_FIELD || 'Badge',
  assignmentBadgeId: process.env.AIRTABLE_ASSIGN_BADGE_ID_FIELD || 'BadgeId',
  assignmentIssuedAt: process.env.AIRTABLE_ASSIGN_ISSUED_AT_FIELD || 'Date Assigned', 
  assignmentStatus: process.env.AIRTABLE_ASSIGN_STATUS_FIELD || 'Status',
  badgeImage: process.env.AIRTABLE_BADGE_IMAGE_FIELD || 'Image',
  badgeImageUrl: process.env.AIRTABLE_BADGE_IMAGE_URL_FIELD || 'ImageUrl',
  badgeName: process.env.AIRTABLE_BADGE_NAME_FIELD || 'Name',
  badgeDescription: process.env.AIRTABLE_BADGE_DESCRIPTION_FIELD || 'Description',
  badgeCriteria: process.env.AIRTABLE_BADGE_CRITERIA_FIELD || 'Criteria',
  badgeId: process.env.AIRTABLE_BADGE_ID_FIELD || 'BadgeId',
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasAirtable: Boolean(base) });
});

app.get('/api/badges/:userId', async (req, res) => {
  if (!base) {
    return res.status(500).json({ error: 'Missing Airtable configuration' });
  }

  const { userId } = req.params;
  const { sessionId } = req.query;

  try {
    const filterParts = [`{${fields.assignmentUser}} = '${userId}'`];
    if (sessionId) filterParts.push(`{${fields.assignmentSession}} = '${sessionId}'`);
    const filterByFormula =
      filterParts.length === 1 ? filterParts[0] : `AND(${filterParts.join(',')})`;

    const selectOptions = {
      filterByFormula,
      maxRecords: 20,
    };
    if (fields.assignmentIssuedAt) {
      selectOptions.sort = [{ field: fields.assignmentIssuedAt, direction: 'desc' }];
    }

    const assignmentRecords = await base(tableNames.assignments).select(selectOptions).all();

    const badgeRefs = [];
    const assignments = assignmentRecords.map((rec) => {
      const badgeLinkIds = rec.get(fields.assignmentBadgeLink); // linked record(s) to Badges table
      const badgeIdFromField = rec.get(fields.assignmentBadgeId); // explicit badge id field
      const badgeRecordId =
        Array.isArray(badgeLinkIds) && badgeLinkIds.length ? badgeLinkIds[0] : null;
      const badgeLookupKey = badgeRecordId || badgeIdFromField;
      if (badgeLookupKey) badgeRefs.push(badgeLookupKey);

      return {
        id: rec.id,
        userId: rec.get(fields.assignmentUser),
        sessionId: rec.get(fields.assignmentSession),
        status: rec.get(fields.assignmentStatus) || 'issued',
        issuedAt:
          rec.get(fields.assignmentIssuedAt) ||
          rec.get('Date Assigned') ||
          rec.get('IssuedAt') ||
          null,
        badgeRef: badgeLookupKey,
      };
    });

    const uniqueBadgeRefs = [...new Set(badgeRefs)];
    const badgeDetails = {};

    for (const ref of uniqueBadgeRefs) {
      let badgeRecord;

      // Try to treat the ref as a record ID first (linked record)
      try {
        badgeRecord = await base(tableNames.badges).find(ref);
      } catch (err) {
        // If not a record id, try matching via BadgeId column
        const matches = await base(tableNames.badges)
          .select({ filterByFormula: `{BadgeId} = '${ref}'`, maxRecords: 1 })
          .all();
        badgeRecord = matches[0];
      }

      if (badgeRecord) {
        const attachment = badgeRecord.get(fields.badgeImage) || badgeRecord.get(fields.badgeImageUrl);
        const imageUrl = Array.isArray(attachment) ? attachment[0].url : attachment;
        badgeDetails[ref] = {
          id: badgeRecord.id,
          badgeId: badgeRecord.get(fields.badgeId) || badgeRecord.id,
          name: badgeRecord.get(fields.badgeName),
          description: badgeRecord.get(fields.badgeDescription),
          imageUrl,
          criteria: badgeRecord.get(fields.badgeCriteria),
        };
      }
    }

    const response = assignments
      .map((item) => ({
        ...item,
        badge: badgeDetails[item.badgeRef] || null,
      }))
      .filter((item) => item.badge);

    res.json({ count: response.length, assignments: response });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch badges', details: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`BugBox digital badge demo listening on http://localhost:${port}`);
});
