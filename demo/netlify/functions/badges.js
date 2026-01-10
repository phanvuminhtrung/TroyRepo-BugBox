import Airtable from 'airtable';
import dotenv from 'dotenv';

dotenv.config();

// Required Airtable configuration to run the function.
const requiredEnv = [
  'AIRTABLE_API_KEY',
  'AIRTABLE_BASE_ID',
  'AIRTABLE_USER_TABLE',
  'AIRTABLE_BADGE_TABLE',
  'AIRTABLE_ASSIGNMENT_TABLE',
];

// Map logical table roles to Airtable table names.
const tableNames = {
  users: process.env.AIRTABLE_USER_TABLE || 'Users',
  badges: process.env.AIRTABLE_BADGE_TABLE || 'Badges',
  assignments: process.env.AIRTABLE_ASSIGNMENT_TABLE || 'AssignedBadges',
};

// Map logical field roles to Airtable field names.
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

// Simple JSON response helper.
const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  try {
    // Validate required environment variables.
    const missing = requiredEnv.filter((key) => !process.env[key]);
    if (missing.length) {
      return jsonResponse(500, { error: `Missing env vars: ${missing.join(', ')}` });
    }

    // Create Airtable base client.
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
      process.env.AIRTABLE_BASE_ID,
    );

    // Extract userId from the path and optional sessionId from querystring.
    const pathSegments = (event.path || '').split('/').filter(Boolean);
    const userId = decodeURIComponent(pathSegments[pathSegments.length - 1] || '');
    const sessionId = event.queryStringParameters?.sessionId;

    if (!userId) return jsonResponse(400, { error: 'userId required' });

    // Build Airtable filter formula (userId + optional sessionId).
    const filterParts = [`{${fields.assignmentUser}} = '${userId}'`];
    if (sessionId) filterParts.push(`{${fields.assignmentSession}} = '${sessionId}'`);
    const filterByFormula =
      filterParts.length === 1 ? filterParts[0] : `AND(${filterParts.join(',')})`;

    // Select assignments, newest first if issued date exists.
    const selectOptions = { filterByFormula, maxRecords: 20 };
    if (fields.assignmentIssuedAt) {
      selectOptions.sort = [{ field: fields.assignmentIssuedAt, direction: 'desc' }];
    }

    // Fetch assignments for this user/session.
    const assignmentRecords = await base(tableNames.assignments).select(selectOptions).all();

    // Collect badge references from assignment records.
    const badgeRefs = [];
    const assignments = assignmentRecords.map((rec) => {
      const badgeLinkIds = rec.get(fields.assignmentBadgeLink);
      const badgeIdFromField = rec.get(fields.assignmentBadgeId);
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

    // Resolve badge details by reference (record id or badge id).
    const badgeDetails = {};
    for (const ref of [...new Set(badgeRefs)]) {
      let badgeRecord;
      try {
        badgeRecord = await base(tableNames.badges).find(ref);
      } catch (err) {
        const matches = await base(tableNames.badges)
          .select({ filterByFormula: `{BadgeId} = '${ref}'`, maxRecords: 1 })
          .all();
        badgeRecord = matches[0];
      }

      if (badgeRecord) {
        // Prefer attachment url; fall back to ImageUrl text field.
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

    // Merge assignment + badge and drop rows missing badge details.
    const response = assignments
      .map((item) => ({
        ...item,
        badge: badgeDetails[item.badgeRef] || null,
      }))
      .filter((item) => item.badge);

    return jsonResponse(200, { count: response.length, assignments: response });
  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: 'Failed to fetch badges', details: err.message });
  }
};