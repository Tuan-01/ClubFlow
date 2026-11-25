import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

const PORT = Number(process.env.PORT || 3001);
const MOCK_MODE = (process.env.MOCK_MODE || 'normal').toLowerCase();
const DELAY_MS = MOCK_MODE === 'slow' ? 2000 : 150;
const MAX_UPLOAD_BODY_BYTES = 20 * 1024 * 1024;
const MAX_CV_BYTES = 5 * 1024 * 1024;

function loadSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

// In-memory state loaded from seed JSON (resets on restart)
const users = loadSeed('users.json');
const campaign = loadSeed('campaign.json');
const interviewSetup = loadSeed('interviewSetup.json');
const applications = loadSeed('applications.json');
const cvStore = new Map();

let nextAppSeq = applications.reduce((max, a) => {
  const m = String(a.id).match(/^A(\d+)$/);
  return m ? Math.max(max, Number(m[1])) : max;
}, 0) + 1;

let nextPosSeq = campaign.positions.length + 1;

const schedule = {
  campaignId: campaign.id,
  status: 'not_generated',
  isReadOnly: false,
  savedAt: null,
  confirmedAt: null,
  parameters: {
    date: campaign.interviewDate,
    windowStart: '09:00',
    windowEnd: '12:00',
    slotDurationMinutes: interviewSetup.slotDurationMinutes
  },
  summary: {
    totalShortlisted: applications.filter((a) => a.screeningStatus === 'shortlisted').length,
    scheduledCount: 0,
    proposedCount: 0,
    unassignedCount: 0,
    conflictCount: 0
  },
  conflicts: [],
  assignments: []
};

const assessments = [];
const resultsState = {
  published: false,
  publishedAt: null
};
const notifications = [];

// ------------------------------------------------------------------ Helpers

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function nowISO() {
  return new Date().toISOString();
}

function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isValidTimeStr(s) {
  if (typeof s !== 'string' || !/^\d{2}:\d{2}$/.test(s)) return false;
  const [hh, mm] = s.split(':').map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

function toMinutes(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + mm;
}

function fromMinutes(total) {
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function generateSlots(startHHMM, endHHMM, durationMinutes) {
  const start = toMinutes(startHHMM);
  const end = toMinutes(endHHMM);
  const slots = [];
  for (let t = start; t + durationMinutes <= end; t += durationMinutes) {
    slots.push(`${fromMinutes(t)}-${fromMinutes(t + durationMinutes)}`);
  }
  return slots;
}

function csvEscape(val) {
  const s = val == null ? '' : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildMinimalPdf(app) {
  const safeText = `${app.id} - ${app.fullName} (${app.studentId}) - ${app.positionTitle}`.replace(/[()\\]/g, '');
  const content = `BT /F1 12 Tf 50 750 Td (${safeText}) Tj ET`;
  const pdf = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(content, 'latin1')} >> stream\n${content}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF'
  ].join('\n');
  return Buffer.from(pdf, 'latin1');
}

function sendJson(res, req, pathname, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  });
  res.end(body);
  console.log(`${req.method} ${pathname} ${status}`);
}

function sendError(res, req, pathname, status, code, message, fields = {}) {
  sendJson(res, req, pathname, status, { error: { code, message, fields } });
}

function sendRaw(res, req, pathname, status, headers, body) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    ...headers
  });
  res.end(body);
  console.log(`${req.method} ${pathname} ${status}`);
}

function readRawBody(req, limitBytes = MAX_UPLOAD_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(Object.assign(new Error('Payload too large'), { code: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readRawBody(req, 1024 * 1024);
  const text = buf.toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
}

function parseMultipart(buffer, contentType) {
  const m = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!m) return null;
  const boundary = m[1] || m[2];
  const delim = Buffer.from(`--${boundary}`, 'latin1');
  const fields = {};
  const files = {};

  let pos = buffer.indexOf(delim);
  while (pos !== -1) {
    const afterDelim = pos + delim.length;
    if (buffer.slice(afterDelim, afterDelim + 2).toString('latin1') === '--') break;
    let partStart = afterDelim;
    if (buffer[partStart] === 0x0d && buffer[partStart + 1] === 0x0a) partStart += 2;
    else if (buffer[partStart] === 0x0a) partStart += 1;

    const nextPos = buffer.indexOf(delim, partStart);
    if (nextPos === -1) break;

    let partEnd = nextPos;
    if (buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) partEnd -= 2;
    else if (buffer[partEnd - 1] === 0x0a) partEnd -= 1;

    const part = buffer.subarray(partStart, partEnd);
    let sep = part.indexOf('\r\n\r\n');
    let sepLen = 4;
    if (sep === -1) {
      sep = part.indexOf('\n\n');
      sepLen = 2;
    }
    if (sep !== -1) {
      const headerText = part.subarray(0, sep).toString('utf8');
      const bodyBuf = part.subarray(sep + sepLen);
      const dispLine = headerText.split(/\r?\n/).find((l) => /^content-disposition:/i.test(l)) || '';
      const typeLine = headerText.split(/\r?\n/).find((l) => /^content-type:/i.test(l)) || '';
      const nameMatch = dispLine.match(/name="([^"]+)"/i);
      const fileMatch = dispLine.match(/filename="([^"]*)"/i);
      if (nameMatch) {
        const fieldName = nameMatch[1];
        if (fileMatch) {
          files[fieldName] = {
            filename: path.basename(fileMatch[1] || 'upload.bin'),
            contentType: typeLine.replace(/^content-type:\s*/i, '').trim() || 'application/octet-stream',
            data: bodyBuf
          };
        } else {
          const val = bodyBuf.toString('utf8');
          if (fieldName in fields) {
            if (Array.isArray(fields[fieldName])) fields[fieldName].push(val);
            else fields[fieldName] = [fields[fieldName], val];
          } else {
            fields[fieldName] = val;
          }
        }
      }
    }
    pos = nextPos;
  }

  return { fields, files };
}

function authenticate(req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  return users.find((u) => `token-${u.id}` === token) || null;
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    studentId: u.studentId
  };
}

// ------------------------------------------------------------------ Projections & Helpers

function publicCampaignView() {
  const empty = MOCK_MODE === 'empty';
  return {
    id: campaign.id,
    name: campaign.name,
    clubName: campaign.clubName,
    description: campaign.description,
    openingDate: campaign.openingDate,
    closingDate: campaign.closingDate,
    interviewDate: campaign.interviewDate,
    instructions: campaign.instructions,
    status: campaign.status,
    applicationsOpen: campaign.applicationsOpen,
    publishedAt: campaign.publishedAt,
    slotDurationMinutes: interviewSetup.slotDurationMinutes,
    availableTimeSlots: empty ? [] : [...interviewSetup.availableSlots],
    positions: empty ? [] : campaign.positions.map((p) => ({ ...p }))
  };
}

function executiveCampaignView() {
  const empty = MOCK_MODE === 'empty';
  return {
    id: campaign.id,
    name: campaign.name,
    clubName: campaign.clubName,
    description: campaign.description,
    openingDate: campaign.openingDate,
    closingDate: campaign.closingDate,
    interviewDate: campaign.interviewDate,
    instructions: campaign.instructions,
    status: campaign.status,
    applicationsOpen: campaign.applicationsOpen,
    isReadOnly: campaign.isReadOnly,
    draftSavedAt: campaign.draftSavedAt,
    publishedAt: campaign.publishedAt,
    positions: empty ? [] : campaign.positions.map((p) => ({ ...p }))
  };
}

function interviewSetupView() {
  const empty = MOCK_MODE === 'empty';
  return {
    campaignId: interviewSetup.campaignId,
    interviewDate: campaign.interviewDate,
    slotDurationMinutes: interviewSetup.slotDurationMinutes,
    isReadOnly: interviewSetup.isReadOnly,
    selectedRoomIds: empty ? [] : [...interviewSetup.selectedRoomIds],
    rooms: empty ? [] : interviewSetup.rooms.map((r) => ({ ...r })),
    positions: empty
      ? []
      : campaign.positions.map((p) => ({ id: p.id, title: p.title, department: p.department })),
    availableSlots: empty ? [] : [...interviewSetup.availableSlots],
    interviewers: empty
      ? []
      : interviewSetup.interviewers.map((iv) => ({
          id: iv.id,
          name: iv.name,
          email: iv.email,
          positionIds: [...iv.positionIds],
          availableSlots: [...iv.availableSlots]
        }))
  };
}

function computeStatistics() {
  if (MOCK_MODE === 'empty') {
    return {
      totalApplications: 0,
      uniqueApplicants: 0,
      pendingReview: 0,
      shortlisted: 0,
      rejected: 0
    };
  }
  return {
    totalApplications: applications.length,
    uniqueApplicants: new Set(applications.map((a) => a.applicantId)).size,
    pendingReview: applications.filter((a) => a.screeningStatus === 'submitted').length,
    shortlisted: applications.filter((a) => a.screeningStatus === 'shortlisted').length,
    rejected: applications.filter((a) => a.screeningStatus === 'rejected').length
  };
}

function interviewSummaryForApp(appId) {
  if (schedule.status !== 'confirmed') return null;
  const asg = schedule.assignments.find((a) => a.applicationId === appId && a.status !== 'unassigned');
  if (!asg) return null;
  return {
    date: asg.date,
    startTime: asg.startTime,
    endTime: asg.endTime,
    roomName: asg.roomName,
    interviewerName: asg.interviewerName
  };
}

function applicantListApplicationView(app) {
  return {
    id: app.id,
    campaignId: app.campaignId,
    positionId: app.positionId,
    positionTitle: app.positionTitle,
    department: app.department,
    submittedAt: app.submittedAt,
    screeningStatus: app.screeningStatus,
    interview: interviewSummaryForApp(app.id),
    finalResult: resultsState.published ? app.finalResult : 'pending',
    resultPublishedAt: resultsState.published ? resultsState.publishedAt : null
  };
}

function applicationDetailView(app, includeInternalNote) {
  const view = {
    id: app.id,
    campaignId: app.campaignId,
    positionId: app.positionId,
    positionTitle: app.positionTitle,
    department: app.department,
    fullName: app.fullName,
    studentId: app.studentId,
    email: app.email,
    phone: app.phone,
    major: app.major,
    yearOfStudy: app.yearOfStudy,
    motivationStatement: app.motivationStatement,
    wordCount: app.wordCount,
    availabilitySlots: [...app.availabilitySlots],
    cvFileName: app.cvFileName,
    cvFileSizeBytes: app.cvFileSizeBytes,
    cvUrl: `/api/applications/${app.id}/cv`,
    submittedAt: app.submittedAt,
    screeningStatus: app.screeningStatus
  };
  if (includeInternalNote) {
    view.internalNote = app.internalNote;
  }
  view.interview = interviewSummaryForApp(app.id);
  view.finalResult = resultsState.published ? app.finalResult : 'pending';
  view.resultPublishedAt = resultsState.published ? resultsState.publishedAt : null;
  return view;
}

function executiveListRowView(app) {
  return {
    id: app.id,
    campaignId: app.campaignId,
    positionId: app.positionId,
    positionTitle: app.positionTitle,
    department: app.department,
    fullName: app.fullName,
    studentId: app.studentId,
    email: app.email,
    phone: app.phone,
    major: app.major,
    yearOfStudy: app.yearOfStudy,
    submittedAt: app.submittedAt,
    screeningStatus: app.screeningStatus,
    internalNote: app.internalNote
  };
}

function filterAndSortApplications(query) {
  const search = (query.get('search') || '').trim().toLowerCase();
  const positionId = (query.get('positionId') || 'all').trim();
  const status = (query.get('status') || 'all').trim();
  const sortBy = (query.get('sortBy') || 'submittedAt').trim();
  const sortOrder = (query.get('sortOrder') || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';

  let list = applications.filter((a) => {
    if (positionId && positionId !== 'all' && a.positionId !== positionId) return false;
    if (status && status !== 'all' && a.screeningStatus !== status) return false;
    if (search) {
      const hay = `${a.id} ${a.fullName} ${a.studentId} ${a.email}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const dir = sortOrder === 'asc' ? 1 : -1;
  list = [...list].sort((a, b) => {
    let va;
    let vb;
    if (sortBy === 'applicantName') {
      va = a.fullName.toLowerCase();
      vb = b.fullName.toLowerCase();
    } else if (sortBy === 'positionTitle') {
      va = a.positionTitle.toLowerCase();
      vb = b.positionTitle.toLowerCase();
    } else if (sortBy === 'status') {
      va = a.screeningStatus;
      vb = b.screeningStatus;
    } else {
      va = a.submittedAt;
      vb = b.submittedAt;
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return a.id.localeCompare(b.id) * dir;
  });

  return list;
}

function isInterviewerAssignedToApp(interviewerId, appId) {
  return (
    schedule.status === 'confirmed' &&
    schedule.assignments.some(
      (a) => a.applicationId === appId && a.interviewerId === interviewerId && a.status !== 'unassigned'
    )
  );
}

// ------------------------------------------------------------------ Scheduling Engine

function intervalsOverlap(a, b) {
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return false;
  if (a.date !== b.date) return false;
  const s1 = toMinutes(a.startTime);
  const e1 = toMinutes(a.endTime);
  const s2 = toMinutes(b.startTime);
  const e2 = toMinutes(b.endTime);
  return s1 < e2 && s2 < e1;
}

function recomputeSchedule() {
  for (const a of schedule.assignments) {
    if (!a.startTime || !a.endTime || !a.interviewerId || !a.roomId) {
      a.status = 'unassigned';
      a.reason = a.reason || 'No slot assigned.';
      a.conflictWith = [];
    } else {
      a.status = 'proposed';
      a.reason = null;
      a.conflictWith = [];
    }
  }

  const conflictMap = new Map();
  const conflictDetails = new Map();

  for (let i = 0; i < schedule.assignments.length; i++) {
    const a = schedule.assignments[i];
    if (a.status === 'unassigned') continue;
    for (let j = i + 1; j < schedule.assignments.length; j++) {
      const b = schedule.assignments[j];
      if (b.status === 'unassigned') continue;
      if (!intervalsOverlap(a, b)) continue;

      const checks = [];
      if (a.applicantId === b.applicantId) {
        checks.push({ type: 'applicant', entityName: a.applicantName, label: 'Applicant' });
      }
      if (a.interviewerId === b.interviewerId) {
        checks.push({ type: 'interviewer', entityName: a.interviewerName, label: 'Interviewer' });
      }
      if (a.roomId === b.roomId) {
        checks.push({ type: 'room', entityName: a.roomName, label: 'Room' });
      }

      for (const chk of checks) {
        const slot = `${a.startTime}-${a.endTime}`;
        const key = `${chk.type}:${chk.entityName}:${slot}`;
        if (!conflictMap.has(key)) {
          conflictMap.set(key, {
            type: chk.type,
            entityName: chk.entityName,
            timeSlot: slot,
            assignmentIds: new Set(),
            appIds: new Set()
          });
        }
        const entry = conflictMap.get(key);
        entry.assignmentIds.add(a.id);
        entry.assignmentIds.add(b.id);
        entry.appIds.add(a.applicationId);
        entry.appIds.add(b.applicationId);

        a.status = 'conflict';
        b.status = 'conflict';
        if (!a.conflictWith.includes(b.id)) a.conflictWith.push(b.id);
        if (!b.conflictWith.includes(a.id)) b.conflictWith.push(a.id);

        const addDetail = (item, other) => {
          const list = conflictDetails.get(item.id) || [];
          list.push(`${chk.label} ${chk.entityName} overlaps with ${other.applicationId} at ${slot}.`);
          conflictDetails.set(item.id, list);
        };
        addDetail(a, b);
        addDetail(b, a);
      }
    }
  }

  for (const a of schedule.assignments) {
    if (a.status === 'conflict') {
      const msgs = conflictDetails.get(a.id) || [];
      a.reason = msgs[0] || 'Schedule overlap detected.';
    }
  }

  schedule.conflicts = [...conflictMap.values()].map((c) => {
    const appList = [...c.appIds].sort();
    const label = c.type === 'applicant' ? 'Applicant' : c.type === 'interviewer' ? 'Interviewer' : 'Room';
    return {
      type: c.type,
      entityName: c.entityName,
      timeSlot: c.timeSlot,
      assignmentIds: [...c.assignmentIds].sort(),
      message: `${label} ${c.entityName} has overlapping interviews (${appList.join(' and ')}) at ${c.timeSlot}.`
    };
  });

  const proposedCount = schedule.assignments.filter((a) => a.status === 'proposed').length;
  const conflictCount = schedule.assignments.filter((a) => a.status === 'conflict').length;
  const unassignedCount = schedule.assignments.filter((a) => a.status === 'unassigned').length;

  schedule.summary = {
    totalShortlisted: schedule.assignments.length,
    scheduledCount: proposedCount + conflictCount,
    proposedCount,
    unassignedCount,
    conflictCount
  };
}

function scheduleView() {
  if (MOCK_MODE === 'empty') {
    return {
      campaignId: schedule.campaignId,
      status: 'not_generated',
      isReadOnly: false,
      savedAt: null,
      confirmedAt: null,
      parameters: { ...schedule.parameters },
      summary: {
        totalShortlisted: 0,
        scheduledCount: 0,
        proposedCount: 0,
        unassignedCount: 0,
        conflictCount: 0
      },
      conflicts: [],
      assignments: []
    };
  }

  if (schedule.status === 'not_generated') {
    schedule.summary = {
      totalShortlisted: applications.filter((a) => a.screeningStatus === 'shortlisted').length,
      scheduledCount: 0,
      proposedCount: 0,
      unassignedCount: 0,
      conflictCount: 0
    };
  }

  return {
    campaignId: schedule.campaignId,
    status: schedule.status,
    isReadOnly: schedule.isReadOnly,
    savedAt: schedule.savedAt,
    confirmedAt: schedule.confirmedAt,
    parameters: { ...schedule.parameters },
    summary: { ...schedule.summary },
    conflicts: schedule.conflicts.map((c) => ({ ...c, assignmentIds: [...c.assignmentIds] })),
    assignments: schedule.assignments.map((a) => ({ ...a, conflictWith: [...a.conflictWith] }))
  };
}

function generateDraftSchedule(params) {
  const { date, windowStart, windowEnd, slotDurationMinutes } = params;
  const windowSlots = generateSlots(windowStart, windowEnd, slotDurationMinutes);
  const shortlisted = applications
    .filter((a) => a.screeningStatus === 'shortlisted')
    .sort((a, b) => a.id.localeCompare(b.id));

  const selectedRooms = interviewSetup.rooms.filter((r) => interviewSetup.selectedRoomIds.includes(r.id));
  const placed = [];
  const interviewerLoad = new Map(interviewSetup.interviewers.map((iv) => [iv.id, 0]));

  for (const app of shortlisted) {
    const eligibleInterviewers = interviewSetup.interviewers
      .filter((iv) => iv.positionIds.includes(app.positionId))
      .sort((a, b) => {
        if (a.positionIds.length !== b.positionIds.length) return a.positionIds.length - b.positionIds.length;
        return (interviewerLoad.get(a.id) || 0) - (interviewerLoad.get(b.id) || 0);
      });

    const candidateSlots = windowSlots.filter((slot) => app.availabilitySlots.includes(slot));
    let chosen = null;

    // Pass 1: find completely conflict-free slot matching applicant + interviewer + room
    outerClean: for (const slot of candidateSlots) {
      const [startTime, endTime] = slot.split('-');
      const probe = { date, startTime, endTime };
      const applicantBusy = placed.some((p) => p.applicantId === app.applicantId && intervalsOverlap(p, probe));
      if (applicantBusy) continue;

      for (const iv of eligibleInterviewers) {
        if (!iv.availableSlots.includes(slot)) continue;
        const ivBusy = placed.some((p) => p.interviewerId === iv.id && intervalsOverlap(p, probe));
        if (ivBusy) continue;

        for (const rm of selectedRooms) {
          const rmBusy = placed.some((p) => p.roomId === rm.id && intervalsOverlap(p, probe));
          if (!rmBusy) {
            chosen = { startTime, endTime, iv, rm };
            break outerClean;
          }
        }
      }
    }

    // Pass 2: if applicant has an overlapping application at their only mutually-available slot,
    // place with free interviewer+room so the conflict is surfaced for manual resolution
    if (!chosen) {
      outerFallback: for (const slot of candidateSlots) {
        const [startTime, endTime] = slot.split('-');
        const probe = { date, startTime, endTime };
        for (const iv of eligibleInterviewers) {
          if (!iv.availableSlots.includes(slot)) continue;
          const ivBusy = placed.some((p) => p.interviewerId === iv.id && intervalsOverlap(p, probe));
          if (ivBusy) continue;

          for (const rm of selectedRooms) {
            const rmBusy = placed.some((p) => p.roomId === rm.id && intervalsOverlap(p, probe));
            if (!rmBusy) {
              chosen = { startTime, endTime, iv, rm };
              break outerFallback;
            }
          }
        }
      }
    }

    if (chosen) {
      interviewerLoad.set(chosen.iv.id, (interviewerLoad.get(chosen.iv.id) || 0) + 1);
      placed.push({
        id: `sch-${app.id}`,
        applicationId: app.id,
        applicantId: app.applicantId,
        applicantName: app.fullName,
        studentId: app.studentId,
        positionId: app.positionId,
        positionTitle: app.positionTitle,
        date,
        startTime: chosen.startTime,
        endTime: chosen.endTime,
        interviewerId: chosen.iv.id,
        interviewerName: chosen.iv.name,
        roomId: chosen.rm.id,
        roomName: chosen.rm.name,
        status: 'proposed',
        reason: null,
        conflictWith: []
      });
    } else {
      placed.push({
        id: `sch-${app.id}`,
        applicationId: app.id,
        applicantId: app.applicantId,
        applicantName: app.fullName,
        studentId: app.studentId,
        positionId: app.positionId,
        positionTitle: app.positionTitle,
        date,
        startTime: null,
        endTime: null,
        interviewerId: null,
        interviewerName: null,
        roomId: null,
        roomName: null,
        status: 'unassigned',
        reason: 'No slot matches both applicant availability and an assigned interviewer\'s availability.',
        conflictWith: []
      });
    }
  }

  schedule.status = 'draft';
  schedule.savedAt = null;
  schedule.parameters = { date, windowStart, windowEnd, slotDurationMinutes };
  schedule.assignments = placed;
  recomputeSchedule();
}

// ------------------------------------------------------------------ Results Helpers

function eligibleResultItems() {
  if (MOCK_MODE === 'empty' || schedule.status !== 'confirmed') return [];
  return schedule.assignments
    .filter((a) => a.status !== 'unassigned')
    .sort((a, b) => a.applicationId.localeCompare(b.applicationId))
    .map((asg) => {
      const app = applications.find((x) => x.id === asg.applicationId);
      const asm = assessments.find((x) => x.interviewId === asg.id) || null;
      return {
        applicationId: app.id,
        applicantName: app.fullName,
        studentId: app.studentId,
        positionId: app.positionId,
        positionTitle: app.positionTitle,
        interviewerName: asg.interviewerName,
        assessment: asm
          ? {
              id: asm.id,
              recommendation: asm.recommendation,
              score: asm.score,
              feedback: asm.feedback,
              submittedAt: asm.submittedAt
            }
          : null,
        finalResult: app.finalResult,
        decisionNote: app.decisionNote
      };
    });
}

function computeResultsSummary(items) {
  return {
    totalEligible: items.length,
    passCount: items.filter((i) => i.finalResult === 'pass').length,
    failCount: items.filter((i) => i.finalResult === 'fail').length,
    pendingCount: items.filter((i) => i.finalResult === 'pending').length
  };
}

function publicNotificationView(n) {
  return {
    id: n.id,
    applicationId: n.applicationId,
    title: n.title,
    message: n.message,
    result: n.result,
    isRead: n.isRead,
    createdAt: n.createdAt
  };
}

// ------------------------------------------------------------------ Request Router

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    sendRaw(res, req, pathname, 204, {}, '');
    return;
  }

  await sleep(DELAY_MS);

  if (MOCK_MODE === 'error' && !(method === 'POST' && pathname === '/api/auth/login')) {
    sendError(res, req, pathname, 500, 'INTERNAL_ERROR', 'Simulated server error (MOCK_MODE=error).');
    return;
  }

  // -------------------- 01 Auth --------------------
  if (method === 'POST' && pathname === '/api/auth/login') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
      return;
    }
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const fields = {};
    if (!email) fields.email = 'Email is required.';
    if (!password.trim()) fields.password = 'Password is required.';
    if (Object.keys(fields).length) {
      sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Please provide both email and password.', fields);
      return;
    }
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) {
      sendError(res, req, pathname, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      return;
    }
    sendJson(res, req, pathname, 200, {
      token: `token-${user.id}`,
      user: publicUser(user)
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = authenticate(req);
    if (!user) {
      sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
      return;
    }
    sendJson(res, req, pathname, 200, { user: publicUser(user) });
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const user = authenticate(req);
    if (!user) {
      sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
      return;
    }
    sendJson(res, req, pathname, 200, { ok: true });
    return;
  }

  // -------------------- 02 Campaigns & Interview Setup --------------------
  if (method === 'GET' && pathname === '/api/campaign/public') {
    if (campaign.status === 'draft') {
      sendError(res, req, pathname, 404, 'CAMPAIGN_NOT_PUBLISHED', 'No recruitment campaign is currently published.');
      return;
    }
    sendJson(res, req, pathname, 200, { campaign: publicCampaignView() });
    return;
  }

  if (method === 'GET' && pathname === '/api/campaign') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may access campaign configuration.');
    }
    sendJson(res, req, pathname, 200, { campaign: executiveCampaignView() });
    return;
  }

  if (method === 'PUT' && pathname === '/api/campaign/draft') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may update campaign drafts.');
    }
    if (campaign.isReadOnly) {
      return sendError(res, req, pathname, 409, 'SCHEDULE_CONFIRMED', 'Campaign is read-only after schedule confirmation.');
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
    }
    const fields = {};
    for (const key of ['name', 'clubName', 'description', 'openingDate', 'closingDate', 'interviewDate', 'instructions']) {
      if (body[key] !== undefined && typeof body[key] !== 'string') {
        fields[key] = `${key} must be a string.`;
      }
    }
    if (body.positions !== undefined && !Array.isArray(body.positions)) {
      fields.positions = 'Positions must be an array.';
    } else if (Array.isArray(body.positions)) {
      body.positions.forEach((p, idx) => {
        if (!p || typeof p !== 'object') {
          fields[`positions[${idx}]`] = 'Invalid position object.';
        } else if (p.quota !== undefined && (typeof p.quota !== 'number' || Number.isNaN(p.quota))) {
          fields[`positions[${idx}].quota`] = 'Quota must be a number.';
        }
      });
    }
    if (Object.keys(fields).length) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid draft payload.', fields);
    }

    for (const key of ['name', 'clubName', 'description', 'openingDate', 'closingDate', 'interviewDate', 'instructions']) {
      if (body[key] !== undefined) campaign[key] = body[key];
    }
    if (Array.isArray(body.positions)) {
      campaign.positions = body.positions.map((p) => ({
        id: p.id || `pos-${nextPosSeq++}`,
        department: String(p.department ?? ''),
        title: String(p.title ?? ''),
        quota: Number(p.quota ?? 1),
        description: String(p.description ?? ''),
        requirements: String(p.requirements ?? '')
      }));
    }
    campaign.draftSavedAt = nowISO();
    sendJson(res, req, pathname, 200, { campaign: executiveCampaignView() });
    return;
  }

  if (method === 'POST' && pathname === '/api/campaign/publish') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may publish campaigns.');
    }
    if (campaign.isReadOnly) {
      return sendError(res, req, pathname, 409, 'SCHEDULE_CONFIRMED', 'Campaign is read-only after schedule confirmation.');
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
    }

    const fields = {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const clubName = typeof body.clubName === 'string' ? body.clubName.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const openingDate = typeof body.openingDate === 'string' ? body.openingDate.trim() : '';
    const closingDate = typeof body.closingDate === 'string' ? body.closingDate.trim() : '';
    const interviewDate = typeof body.interviewDate === 'string' ? body.interviewDate.trim() : '';
    const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';

    if (!name || name.length > 120) fields.name = 'Campaign name is required (1–120 characters).';
    if (!clubName || clubName.length > 120) fields.clubName = 'Club name is required (1–120 characters).';
    if (!description || description.length > 1000) fields.description = 'Campaign description is required.';
    if (!isValidDateStr(openingDate)) fields.openingDate = 'Valid opening date (YYYY-MM-DD) is required.';
    if (!isValidDateStr(closingDate)) fields.closingDate = 'Valid closing date (YYYY-MM-DD) is required.';
    else if (isValidDateStr(openingDate) && closingDate <= openingDate) {
      fields.closingDate = 'Closing date must be after opening date.';
    }
    if (!isValidDateStr(interviewDate)) fields.interviewDate = 'Valid interview date (YYYY-MM-DD) is required.';
    else if (
      (isValidDateStr(closingDate) && interviewDate <= closingDate) ||
      (isValidDateStr(openingDate) && interviewDate <= openingDate)
    ) {
      fields.interviewDate = 'Interview date must be after closing date.';
    }
    if (!instructions || instructions.length > 1000) fields.instructions = 'Instructions are required (1–1000 characters).';

    if (!Array.isArray(body.positions) || body.positions.length === 0) {
      fields.positions = 'Add at least one position before publishing.';
    } else {
      body.positions.forEach((p, idx) => {
        if (!p || typeof p !== 'object') {
          fields[`positions[${idx}]`] = 'Invalid position.';
          return;
        }
        const dept = typeof p.department === 'string' ? p.department.trim() : '';
        const title = typeof p.title === 'string' ? p.title.trim() : '';
        const desc = typeof p.description === 'string' ? p.description.trim() : '';
        const reqs = typeof p.requirements === 'string' ? p.requirements.trim() : '';
        if (!dept || dept.length > 80) fields[`positions[${idx}].department`] = 'Department is required (1–80 chars).';
        if (!title || title.length > 100) fields[`positions[${idx}].title`] = 'Position title is required (1–100 chars).';
        if (!Number.isInteger(p.quota) || p.quota < 1 || p.quota > 50) {
          fields[`positions[${idx}].quota`] = 'Vacancies quota must be an integer of at least 1.';
        }
        if (!desc || desc.length > 500) fields[`positions[${idx}].description`] = 'Description is required (1–500 chars).';
        if (!reqs || reqs.length > 500) fields[`positions[${idx}].requirements`] = 'Requirements are required (1–500 chars).';
      });
    }

    if (Object.keys(fields).length) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Cannot publish campaign due to invalid fields.', fields);
    }

    campaign.name = name;
    campaign.clubName = clubName;
    campaign.description = description;
    campaign.openingDate = openingDate;
    campaign.closingDate = closingDate;
    campaign.interviewDate = interviewDate;
    campaign.instructions = instructions;
    campaign.positions = body.positions.map((p) => ({
      id: p.id || `pos-${nextPosSeq++}`,
      department: p.department.trim(),
      title: p.title.trim(),
      quota: p.quota,
      description: p.description.trim(),
      requirements: p.requirements.trim()
    }));
    campaign.status = 'published';
    campaign.applicationsOpen = true;
    campaign.publishedAt = nowISO();
    interviewSetup.interviewDate = interviewDate;
    schedule.parameters.date = interviewDate;

    sendJson(res, req, pathname, 200, { campaign: executiveCampaignView() });
    return;
  }

  if (method === 'POST' && pathname === '/api/campaign/close') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may close applications.');
    }
    if (campaign.isReadOnly) {
      return sendError(res, req, pathname, 409, 'SCHEDULE_CONFIRMED', 'Campaign is read-only after schedule confirmation.');
    }
    if (campaign.status === 'draft') {
      return sendError(res, req, pathname, 409, 'CAMPAIGN_NOT_PUBLISHED', 'Cannot close a draft campaign.');
    }
    campaign.status = 'closed';
    campaign.applicationsOpen = false;
    sendJson(res, req, pathname, 200, { campaign: executiveCampaignView() });
    return;
  }

  if (method === 'GET' && pathname === '/api/interview-setup') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may access interview setup.');
    }
    sendJson(res, req, pathname, 200, { setup: interviewSetupView() });
    return;
  }

  if (method === 'PUT' && pathname === '/api/interview-setup') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may update interview setup.');
    }
    if (interviewSetup.isReadOnly || campaign.isReadOnly) {
      return sendError(res, req, pathname, 409, 'SCHEDULE_CONFIRMED', 'Interview setup is read-only after schedule confirmation.');
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
    }

    const fields = {};
    const validRoomIds = new Set(interviewSetup.rooms.map((r) => r.id));
    const validPosIds = new Set(campaign.positions.map((p) => p.id));

    if (![15, 20, 30].includes(body.slotDurationMinutes)) {
      fields.slotDurationMinutes = 'Slot duration must be 15, 20, or 30 minutes.';
    }
    if (!Array.isArray(body.selectedRoomIds) || body.selectedRoomIds.length === 0) {
      fields.selectedRoomIds = 'Select at least one interview room.';
    } else if (body.selectedRoomIds.some((id) => !validRoomIds.has(id))) {
      fields.selectedRoomIds = 'Selected rooms must exist in the pre-configured room list.';
    }

    if (!Array.isArray(body.interviewers) || body.interviewers.length === 0) {
      fields.interviewers = 'Assign at least one interviewer.';
    } else {
      body.interviewers.forEach((iv, idx) => {
        if (!iv || typeof iv !== 'object' || !interviewSetup.interviewers.some((x) => x.id === iv.id)) {
          fields[`interviewers[${idx}].id`] = 'Unknown interviewer ID.';
        }
        if (!Array.isArray(iv?.positionIds) || iv.positionIds.length === 0 || iv.positionIds.some((pid) => !validPosIds.has(pid))) {
          fields[`interviewers[${idx}].positionIds`] = 'Select at least one valid position for each interviewer.';
        }
        if (
          !Array.isArray(iv?.availableSlots) ||
          iv.availableSlots.length === 0 ||
          iv.availableSlots.some((s) => typeof s !== 'string' || !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(s))
        ) {
          fields[`interviewers[${idx}].availableSlots`] = 'Provide at least one valid HH:MM-HH:MM slot.';
        }
      });
    }

    if (Object.keys(fields).length) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid interview setup configuration.', fields);
    }

    interviewSetup.slotDurationMinutes = body.slotDurationMinutes;
    interviewSetup.selectedRoomIds = [...body.selectedRoomIds];
    interviewSetup.availableSlots = generateSlots('09:00', '12:00', body.slotDurationMinutes);
    schedule.parameters.slotDurationMinutes = body.slotDurationMinutes;

    interviewSetup.interviewers = body.interviewers.map((iv) => {
      const existing = interviewSetup.interviewers.find((x) => x.id === iv.id);
      return {
        id: existing.id,
        name: existing.name,
        email: existing.email,
        positionIds: [...iv.positionIds],
        availableSlots: [...iv.availableSlots]
      };
    });

    sendJson(res, req, pathname, 200, { setup: interviewSetupView() });
    return;
  }

  // -------------------- 03 Applications --------------------
  if (method === 'GET' && pathname === '/api/applications/mine') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'applicant') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Applicants may access their own applications list.');
    }
    if (MOCK_MODE === 'empty') {
      sendJson(res, req, pathname, 200, { applications: [] });
      return;
    }
    const mine = applications
      .filter((a) => a.applicantId === user.id)
      .map((a) => applicantListApplicationView(a));
    sendJson(res, req, pathname, 200, { applications: mine });
    return;
  }

  if (method === 'GET' && pathname === '/api/applications/export') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may export applications.');
    }
    const rows = MOCK_MODE === 'empty' ? [] : filterAndSortApplications(url.searchParams);
    const header = ['Application ID', 'Full Name', 'Student ID', 'Email', 'Phone', 'Major', 'Year', 'Position', 'Department', 'Status', 'Submitted At'];
    const lines = [header.map(csvEscape).join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.fullName,
          r.studentId,
          r.email,
          r.phone,
          r.major,
          r.yearOfStudy,
          r.positionTitle,
          r.department,
          r.screeningStatus,
          r.submittedAt
        ]
          .map(csvEscape)
          .join(',')
      );
    }
    sendRaw(
      res,
      req,
      pathname,
      200,
      {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="applications.csv"'
      },
      lines.join('\n')
    );
    return;
  }

  if (method === 'POST' && pathname === '/api/applications') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'applicant') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Applicants may submit applications.');
    }

    let raw;
    try {
      raw = await readRawBody(req, MAX_UPLOAD_BODY_BYTES);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Upload payload could not be read.');
    }

    if (campaign.status !== 'published' || !campaign.applicationsOpen) {
      return sendError(res, req, pathname, 409, 'CAMPAIGN_CLOSED', 'Applications are closed for this campaign.');
    }

    const parsed = parseMultipart(raw, req.headers['content-type']);
    if (!parsed) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Expected multipart/form-data request.');
    }

    const { fields: formFields, files } = parsed;
    const positionId = typeof formFields.positionId === 'string' ? formFields.positionId.trim() : '';
    const fullName = typeof formFields.fullName === 'string' ? formFields.fullName.trim() : '';
    const studentId = typeof formFields.studentId === 'string' ? formFields.studentId.trim() : '';
    const email = typeof formFields.email === 'string' ? formFields.email.trim() : '';
    const phone = typeof formFields.phone === 'string' ? formFields.phone.trim() : '';
    const major = typeof formFields.major === 'string' ? formFields.major.trim() : '';
    const yearRaw = typeof formFields.yearOfStudy === 'string' ? formFields.yearOfStudy.trim() : '';
    const yearOfStudy = Number(yearRaw);
    const motivationStatement = typeof formFields.motivationStatement === 'string' ? formFields.motivationStatement.trim() : '';
    const rawSlots = formFields.availabilitySlots;
    const availabilitySlots = Array.isArray(rawSlots)
      ? rawSlots.map((s) => s.trim()).filter(Boolean)
      : typeof rawSlots === 'string' && rawSlots.trim()
        ? [rawSlots.trim()]
        : [];
    const cv = files.cv;

    const errors = {};
    const position = campaign.positions.find((p) => p.id === positionId);
    if (!position) errors.positionId = 'Select a valid position from the active campaign.';
    if (!fullName || fullName.length > 100) errors.fullName = 'Full name is required (1–100 characters).';
    if (!/^[A-Za-z0-9]{6,15}$/.test(studentId)) errors.studentId = 'Student ID must be 6–15 alphanumeric characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Valid email address is required.';
    if (phone.length < 8 || phone.length > 15) errors.phone = 'Phone number must be 8–15 characters.';
    if (!major || major.length > 100) errors.major = 'Major is required (1–100 characters).';
    if (!Number.isInteger(yearOfStudy) || yearOfStudy < 1 || yearOfStudy > 6) {
      errors.yearOfStudy = 'Year of study must be an integer between 1 and 6.';
    }

    const words = motivationStatement ? motivationStatement.split(/\s+/).filter(Boolean) : [];
    if (words.length === 0) {
      errors.motivationStatement = 'Motivation statement is required.';
    } else if (words.length > 300) {
      errors.motivationStatement = 'Motivation statement must not exceed 300 words.';
    }

    if (availabilitySlots.length === 0) {
      errors.availabilitySlots = 'Select at least one interview availability slot.';
    }

    if (!cv || !cv.data || cv.data.length === 0) {
      errors.cv = 'A PDF CV file is required.';
    } else if (cv.data.length > MAX_CV_BYTES) {
      errors.cv = 'CV file must not exceed 5 MB.';
    } else if (
      !/pdf/i.test(cv.contentType) ||
      cv.data.subarray(0, 4).toString('latin1') !== '%PDF'
    ) {
      errors.cv = 'CV must be a valid PDF file.';
    }

    if (Object.keys(errors).length) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Application validation failed.', errors);
    }

    const existing = applications.find((a) => a.applicantId === user.id && a.positionId === positionId);
    if (existing) {
      return sendError(
        res,
        req,
        pathname,
        409,
        'DUPLICATE_APPLICATION',
        'You have already submitted an application for this position.',
        {
          positionId: `An existing application (${existing.id}) already exists for ${position.title}.`
        }
      );
    }

    const id = `A${String(nextAppSeq++).padStart(2, '0')}`;
    const record = {
      id,
      campaignId: campaign.id,
      applicantId: user.id,
      positionId: position.id,
      positionTitle: position.title,
      department: position.department,
      fullName,
      studentId,
      email,
      phone,
      major,
      yearOfStudy,
      motivationStatement,
      wordCount: words.length,
      availabilitySlots,
      cvFileName: cv.filename || `${studentId}_CV.pdf`,
      cvFileSizeBytes: cv.data.length,
      submittedAt: nowISO(),
      screeningStatus: 'submitted',
      internalNote: '',
      finalResult: 'pending',
      decisionNote: ''
    };
    applications.push(record);
    cvStore.set(id, cv.data);

    sendJson(res, req, pathname, 201, { application: applicationDetailView(record, false) });
    return;
  }

  if (method === 'GET' && pathname === '/api/applications') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may view all applications.');
    }

    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSizeRaw = Number.parseInt(url.searchParams.get('pageSize') || '10', 10) || 10;
    const pageSize = Math.min(50, Math.max(1, pageSizeRaw));

    if (MOCK_MODE === 'empty') {
      sendJson(res, req, pathname, 200, {
        statistics: computeStatistics(),
        pagination: { page: 1, pageSize, totalItems: 0, totalPages: 0 },
        applications: []
      });
      return;
    }

    const filtered = filterAndSortApplications(url.searchParams);
    const totalItems = filtered.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize).map(executiveListRowView);

    sendJson(res, req, pathname, 200, {
      statistics: computeStatistics(),
      pagination: { page, pageSize, totalItems, totalPages },
      applications: paged
    });
    return;
  }

  const cvMatch = pathname.match(/^\/api\/applications\/([^/]+)\/cv$/);
  if (method === 'GET' && cvMatch) {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    const appId = decodeURIComponent(cvMatch[1]);
    const app = applications.find((a) => a.id === appId);
    if (!app) {
      return sendError(res, req, pathname, 404, 'NOT_FOUND', `Application ${appId} was not found.`);
    }
    const allowed =
      user.role === 'executive' ||
      (user.role === 'applicant' && app.applicantId === user.id) ||
      (user.role === 'interviewer' && isInterviewerAssignedToApp(user.id, app.id));
    if (!allowed) {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'You may only view CVs for applications assigned to you.');
    }
    const pdfBuf = cvStore.get(app.id) || buildMinimalPdf(app);
    sendRaw(
      res,
      req,
      pathname,
      200,
      {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${app.cvFileName}"`,
        'Content-Length': String(pdfBuf.length)
      },
      pdfBuf
    );
    return;
  }

  const noteMatch = pathname.match(/^\/api\/applications\/([^/]+)\/note$/);
  if (method === 'PATCH' && noteMatch) {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may edit internal notes.');
    }
    const appId = decodeURIComponent(noteMatch[1]);
    const app = applications.find((a) => a.id === appId);
    if (!app) {
      return sendError(res, req, pathname, 404, 'NOT_FOUND', `Application ${appId} was not found.`);
    }
    if (campaign.isReadOnly) {
      return sendError(res, req, pathname, 409, 'SCHEDULE_CONFIRMED', 'Applications are read-only after schedule confirmation.');
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
    }
    if (typeof body.internalNote !== 'string' || body.internalNote.length > 1000) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid internal note.', {
        internalNote: 'Internal note must be a string of at most 1000 characters.'
      });
    }
    app.internalNote = body.internalNote;
    sendJson(res, req, pathname, 200, { application: applicationDetailView(app, true) });
    return;
  }

  const decisionMatch = pathname.match(/^\/api\/applications\/([^/]+)\/decision$/);
  if (method === 'PATCH' && decisionMatch) {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may record screening decisions.');
    }
    const appId = decodeURIComponent(decisionMatch[1]);
    const app = applications.find((a) => a.id === appId);
    if (!app) {
      return sendError(res, req, pathname, 404, 'NOT_FOUND', `Application ${appId} was not found.`);
    }
    if (campaign.isReadOnly) {
      return sendError(res, req, pathname, 409, 'SCHEDULE_CONFIRMED', 'Screening decisions are locked after schedule confirmation.');
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
    }
    if (!['shortlisted', 'rejected'].includes(body.decision)) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid screening decision.', {
        decision: 'Decision must be "shortlisted" or "rejected".'
      });
    }
    app.screeningStatus = body.decision;
    sendJson(res, req, pathname, 200, {
      application: applicationDetailView(app, true),
      statistics: computeStatistics()
    });
    return;
  }

  const appDetailMatch = pathname.match(/^\/api\/applications\/([^/]+)$/);
  if (method === 'GET' && appDetailMatch) {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    const appId = decodeURIComponent(appDetailMatch[1]);
    const app = applications.find((a) => a.id === appId);
    if (!app) {
      return sendError(res, req, pathname, 404, 'NOT_FOUND', `Application ${appId} was not found.`);
    }
    const allowed =
      user.role === 'executive' ||
      (user.role === 'applicant' && app.applicantId === user.id) ||
      (user.role === 'interviewer' && isInterviewerAssignedToApp(user.id, app.id));
    if (!allowed) {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'You do not have permission to view this application.');
    }
    sendJson(res, req, pathname, 200, { application: applicationDetailView(app, user.role === 'executive') });
    return;
  }

  // -------------------- 04 Scheduling & Confirmation --------------------
  if (method === 'GET' && pathname === '/api/schedule') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may access interview scheduling.');
    }
    sendJson(res, req, pathname, 200, { schedule: scheduleView() });
    return;
  }

  if (method === 'POST' && pathname === '/api/schedule/generate') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may generate interview schedules.');
    }
    if (schedule.isReadOnly || campaign.isReadOnly) {
      return sendError(res, req, pathname, 409, 'SCHEDULE_CONFIRMED', 'Schedule is already confirmed and read-only.');
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
    }

    const fields = {};
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const windowStart = typeof body.windowStart === 'string' ? body.windowStart.trim() : '';
    const windowEnd = typeof body.windowEnd === 'string' ? body.windowEnd.trim() : '';
    const slotDurationMinutes = body.slotDurationMinutes;

    if (!isValidDateStr(date) || date <= campaign.closingDate) {
      fields.date = `Interview date must be a valid date after campaign closing date (${campaign.closingDate}).`;
    }
    if (!isValidTimeStr(windowStart)) {
      fields.windowStart = 'Window start time must be HH:MM.';
    }
    if (!isValidTimeStr(windowEnd)) {
      fields.windowEnd = 'Window end time must be HH:MM.';
    } else if (isValidTimeStr(windowStart) && toMinutes(windowEnd) <= toMinutes(windowStart)) {
      fields.windowEnd = 'Window end time must be after start time.';
    }
    if (![15, 20, 30].includes(slotDurationMinutes)) {
      fields.slotDurationMinutes = 'Slot duration must be 15, 20, or 30 minutes.';
    }

    if (Object.keys(fields).length) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid schedule generation parameters.', fields);
    }

    const shortlisted = applications.filter((a) => a.screeningStatus === 'shortlisted');
    if (shortlisted.length === 0) {
      return sendError(res, req, pathname, 409, 'NO_SHORTLISTED_APPLICATIONS', 'Shortlist at least one application before generating a schedule.');
    }

    generateDraftSchedule({ date, windowStart, windowEnd, slotDurationMinutes });
    sendJson(res, req, pathname, 200, { schedule: scheduleView() });
    return;
  }

  const assignmentMatch = pathname.match(/^\/api\/schedule\/assignments\/([^/]+)$/);
  if (method === 'PATCH' && assignmentMatch) {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may edit schedule assignments.');
    }
    if (schedule.isReadOnly || campaign.isReadOnly) {
      return sendError(res, req, pathname, 409, 'SCHEDULE_CONFIRMED', 'Schedule is already confirmed and read-only.');
    }
    const asgId = decodeURIComponent(assignmentMatch[1]);
    const asg = schedule.assignments.find((a) => a.id === asgId);
    if (!asg) {
      return sendError(res, req, pathname, 404, 'NOT_FOUND', `Assignment ${asgId} was not found.`);
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
    }

    const fields = {};
    const startTime = typeof body.startTime === 'string' ? body.startTime.trim() : '';
    const endTime = typeof body.endTime === 'string' ? body.endTime.trim() : '';
    const interviewerId = typeof body.interviewerId === 'string' ? body.interviewerId.trim() : '';
    const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';

    if (!isValidTimeStr(startTime)) fields.startTime = 'Start time must be HH:MM.';
    if (!isValidTimeStr(endTime)) fields.endTime = 'End time must be HH:MM.';
    else if (
      isValidTimeStr(startTime) &&
      toMinutes(endTime) - toMinutes(startTime) !== schedule.parameters.slotDurationMinutes
    ) {
      fields.endTime = `Slot length must match campaign duration (${schedule.parameters.slotDurationMinutes} minutes).`;
    }

    const iv = interviewSetup.interviewers.find((x) => x.id === interviewerId);
    if (!iv) {
      fields.interviewerId = 'Unknown interviewer.';
    } else if (!iv.positionIds.includes(asg.positionId)) {
      fields.interviewerId = `Interviewer ${iv.name} is not assigned to ${asg.positionTitle}.`;
    }

    const rm = interviewSetup.rooms.find(
      (r) => r.id === roomId && interviewSetup.selectedRoomIds.includes(r.id)
    );
    if (!rm) {
      fields.roomId = 'Select a valid room from the interview setup.';
    }

    if (Object.keys(fields).length) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid assignment update.', fields);
    }

    asg.date = schedule.parameters.date;
    asg.startTime = startTime;
    asg.endTime = endTime;
    asg.interviewerId = iv.id;
    asg.interviewerName = iv.name;
    asg.roomId = rm.id;
    asg.roomName = rm.name;

    recomputeSchedule();
    sendJson(res, req, pathname, 200, { schedule: scheduleView() });
    return;
  }

  if (method === 'PUT' && pathname === '/api/schedule') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may save schedule changes.');
    }
    if (schedule.isReadOnly || campaign.isReadOnly) {
      return sendError(res, req, pathname, 409, 'SCHEDULE_CONFIRMED', 'Schedule is already confirmed and read-only.');
    }
    if (schedule.status === 'not_generated') {
      return sendError(res, req, pathname, 409, 'SCHEDULE_NOT_GENERATED', 'Generate a draft schedule before saving.');
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
    }

    if (body.assignments !== undefined) {
      if (!Array.isArray(body.assignments)) {
        return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Assignments must be an array.', {
          assignments: 'Assignments must be an array.'
        });
      }
      const fields = {};
      const pendingUpdates = [];
      body.assignments.forEach((item, idx) => {
        const asg = schedule.assignments.find((a) => a.id === item?.id);
        if (!asg) {
          fields[`assignments[${idx}].id`] = 'Unknown assignment ID.';
          return;
        }
        const startTime = typeof item.startTime === 'string' ? item.startTime.trim() : '';
        const endTime = typeof item.endTime === 'string' ? item.endTime.trim() : '';
        const iv = interviewSetup.interviewers.find((x) => x.id === item.interviewerId);
        const rm = interviewSetup.rooms.find(
          (r) => r.id === item.roomId && interviewSetup.selectedRoomIds.includes(r.id)
        );
        if (!isValidTimeStr(startTime) || !isValidTimeStr(endTime) || toMinutes(endTime) - toMinutes(startTime) !== schedule.parameters.slotDurationMinutes) {
          fields[`assignments[${idx}].startTime`] = 'Invalid time slot for campaign duration.';
        }
        if (!iv || !iv.positionIds.includes(asg.positionId)) {
          fields[`assignments[${idx}].interviewerId`] = 'Invalid interviewer for position.';
        }
        if (!rm) {
          fields[`assignments[${idx}].roomId`] = 'Invalid room selection.';
        }
        pendingUpdates.push({ asg, startTime, endTime, iv, rm });
      });
      if (Object.keys(fields).length) {
        return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid schedule assignments.', fields);
      }
      for (const u of pendingUpdates) {
        u.asg.date = schedule.parameters.date;
        u.asg.startTime = u.startTime;
        u.asg.endTime = u.endTime;
        u.asg.interviewerId = u.iv.id;
        u.asg.interviewerName = u.iv.name;
        u.asg.roomId = u.rm.id;
        u.asg.roomName = u.rm.name;
      }
      if (pendingUpdates.length > 0) recomputeSchedule();
    }

    schedule.savedAt = nowISO();
    sendJson(res, req, pathname, 200, { schedule: scheduleView() });
    return;
  }

  if (method === 'GET' && pathname === '/api/schedule/export') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may export the schedule.');
    }
    if (schedule.status === 'not_generated') {
      return sendError(res, req, pathname, 409, 'SCHEDULE_NOT_GENERATED', 'No schedule draft exists yet.');
    }
    const rows = MOCK_MODE === 'empty' ? [] : schedule.assignments;
    const header = ['Assignment ID', 'Application ID', 'Applicant', 'Student ID', 'Position', 'Date', 'Start', 'End', 'Interviewer', 'Room', 'Status'];
    const lines = [header.map(csvEscape).join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.applicationId,
          r.applicantName,
          r.studentId,
          r.positionTitle,
          r.date,
          r.startTime || '',
          r.endTime || '',
          r.interviewerName || '',
          r.roomName || '',
          r.status
        ]
          .map(csvEscape)
          .join(',')
      );
    }
    sendRaw(
      res,
      req,
      pathname,
      200,
      {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="interview-schedule.csv"'
      },
      lines.join('\n')
    );
    return;
  }

  if (method === 'POST' && pathname === '/api/schedule/confirm') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may confirm the schedule.');
    }
    if (schedule.isReadOnly || campaign.isReadOnly) {
      return sendError(res, req, pathname, 409, 'SCHEDULE_CONFIRMED', 'Schedule is already confirmed and read-only.');
    }
    if (campaign.applicationsOpen || campaign.status === 'published') {
      return sendError(res, req, pathname, 409, 'CAMPAIGN_NOT_CLOSED', 'Close campaign applications before confirming the interview schedule.');
    }
    const pendingApps = applications.filter((a) => a.screeningStatus === 'submitted');
    if (pendingApps.length > 0) {
      return sendError(
        res,
        req,
        pathname,
        409,
        'PENDING_SCREENING',
        `Review all pending applications before confirming schedule (${pendingApps.map((a) => a.id).join(', ')}).`
      );
    }
    if (schedule.status === 'not_generated') {
      return sendError(res, req, pathname, 409, 'SCHEDULE_INCOMPLETE', 'Generate an interview schedule before confirming.');
    }

    const conflicts = schedule.assignments.filter((a) => a.status === 'conflict');
    const unassigned = schedule.assignments.filter((a) => a.status === 'unassigned');
    if (conflicts.length > 0 || unassigned.length > 0) {
      const parts = [];
      const fields = {};
      if (conflicts.length > 0) {
        const ids = conflicts.map((a) => a.applicationId).join(', ');
        parts.push(`unresolved conflicts (${ids})`);
        fields.conflicts = schedule.conflicts.map((c) => c.message).join(' ');
      }
      if (unassigned.length > 0) {
        const ids = unassigned.map((a) => a.applicationId).join(', ');
        parts.push(`unassigned applications (${ids})`);
        fields.unassigned = unassigned
          .map((a) => `${a.applicationId} (${a.applicantName}) has no assigned slot.`)
          .join(' ');
      }
      return sendError(
        res,
        req,
        pathname,
        409,
        'SCHEDULE_INCOMPLETE',
        `Cannot confirm schedule: ${parts.join(' and ')} remain.`,
        fields
      );
    }

    schedule.status = 'confirmed';
    schedule.isReadOnly = true;
    schedule.confirmedAt = nowISO();
    campaign.status = 'confirmed';
    campaign.applicationsOpen = false;
    campaign.isReadOnly = true;
    interviewSetup.isReadOnly = true;

    sendJson(res, req, pathname, 200, {
      schedule: scheduleView(),
      campaign: executiveCampaignView()
    });
    return;
  }

  // -------------------- 05 Interviews, Assessments, Results & Notifications --------------------
  if (method === 'GET' && pathname === '/api/interviews/mine') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'interviewer') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Interviewers may view assigned interviews.');
    }
    if (MOCK_MODE === 'empty' || schedule.status !== 'confirmed') {
      sendJson(res, req, pathname, 200, {
        scheduleConfirmed: schedule.status === 'confirmed',
        interviews: []
      });
      return;
    }

    const mine = schedule.assignments
      .filter((a) => a.interviewerId === user.id && a.status !== 'unassigned')
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '') || a.applicationId.localeCompare(b.applicationId))
      .map((a) => {
        const app = applications.find((x) => x.id === a.applicationId);
        const asm = assessments.find((x) => x.interviewId === a.id) || null;
        return {
          id: a.id,
          applicationId: a.applicationId,
          applicantName: a.applicantName,
          studentId: a.studentId,
          positionId: a.positionId,
          positionTitle: a.positionTitle,
          department: app ? app.department : '',
          date: a.date,
          startTime: a.startTime,
          endTime: a.endTime,
          roomName: a.roomName,
          cvUrl: `/api/applications/${a.applicationId}/cv`,
          assessment: asm
            ? {
                id: asm.id,
                recommendation: asm.recommendation,
                score: asm.score,
                feedback: asm.feedback,
                submittedAt: asm.submittedAt
              }
            : null
        };
      });

    sendJson(res, req, pathname, 200, {
      scheduleConfirmed: true,
      interviews: mine
    });
    return;
  }

  const asmMatch = pathname.match(/^\/api\/interviews\/([^/]+)\/assessment$/);
  if (method === 'POST' && asmMatch) {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'interviewer') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Interviewers may submit interview assessments.');
    }
    const interviewId = decodeURIComponent(asmMatch[1]);
    const asg = schedule.assignments.find((a) => a.id === interviewId);
    if (!asg) {
      return sendError(res, req, pathname, 404, 'NOT_FOUND', `Interview ${interviewId} was not found.`);
    }
    if (asg.interviewerId !== user.id) {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'You may only submit assessments for interviews assigned to you.');
    }
    if (schedule.status !== 'confirmed') {
      return sendError(res, req, pathname, 409, 'SCHEDULE_NOT_CONFIRMED', 'Assessments can only be submitted after schedule confirmation.');
    }
    if (assessments.some((x) => x.interviewId === interviewId)) {
      return sendError(res, req, pathname, 409, 'ASSESSMENT_ALREADY_SUBMITTED', 'An assessment has already been submitted for this interview.');
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
    }

    const fields = {};
    if (!['recommend', 'conditional', 'not_recommend'].includes(body.recommendation)) {
      fields.recommendation = 'Recommendation must be recommend, conditional, or not_recommend.';
    }
    if (!Number.isInteger(body.score) || body.score < 1 || body.score > 10) {
      fields.score = 'Score must be an integer between 1 and 10.';
    }
    const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
    if (!feedback || feedback.length > 1000) {
      fields.feedback = feedback ? 'Feedback must not exceed 1000 characters.' : 'Interview feedback is required.';
    }
    if (Object.keys(fields).length) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Assessment validation failed.', fields);
    }

    const assessment = {
      id: `asm-${asg.applicationId}`,
      interviewId: asg.id,
      applicationId: asg.applicationId,
      interviewerId: user.id,
      recommendation: body.recommendation,
      score: body.score,
      feedback,
      submittedAt: nowISO()
    };
    assessments.push(assessment);
    sendJson(res, req, pathname, 201, { assessment });
    return;
  }

  if (method === 'GET' && pathname === '/api/results') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may access final recruitment results.');
    }
    const items = eligibleResultItems();
    sendJson(res, req, pathname, 200, {
      scheduleConfirmed: schedule.status === 'confirmed',
      resultsPublished: resultsState.published,
      publishedAt: resultsState.publishedAt,
      summary: computeResultsSummary(items),
      items
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/results/publish') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may publish results.');
    }
    if (schedule.status !== 'confirmed') {
      return sendError(res, req, pathname, 409, 'SCHEDULE_NOT_CONFIRMED', 'Confirm the interview schedule before publishing results.');
    }
    if (resultsState.published) {
      return sendError(res, req, pathname, 409, 'RESULTS_ALREADY_PUBLISHED', 'Final results have already been published.');
    }

    const items = eligibleResultItems();
    const pending = items.filter((i) => i.finalResult === 'pending');
    if (pending.length > 0) {
      return sendError(
        res,
        req,
        pathname,
        409,
        'PENDING_RESULTS',
        'Record Pass or Fail for all eligible applications before publishing.',
        { pending: `Pending applications: ${pending.map((p) => p.applicationId).join(', ')}` }
      );
    }

    resultsState.published = true;
    resultsState.publishedAt = nowISO();

    for (const item of items) {
      const app = applications.find((a) => a.id === item.applicationId);
      const label = item.finalResult === 'pass' ? 'Pass' : 'Fail';
      notifications.push({
        id: `notif-${item.applicationId}`,
        userId: app.applicantId,
        applicationId: item.applicationId,
        title: `Final Result Published — ${item.positionTitle}`,
        message: `Your application ${item.applicationId} for ${item.positionTitle} resulted in: ${label}.`,
        result: item.finalResult,
        isRead: false,
        createdAt: resultsState.publishedAt
      });
    }

    sendJson(res, req, pathname, 200, {
      resultsPublished: true,
      publishedAt: resultsState.publishedAt,
      notifiedCount: items.length
    });
    return;
  }

  const resultMatch = pathname.match(/^\/api\/results\/([^/]+)$/);
  if (method === 'PATCH' && resultMatch) {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.role !== 'executive') {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'Only Executives may record final results.');
    }
    if (schedule.status !== 'confirmed') {
      return sendError(res, req, pathname, 409, 'SCHEDULE_NOT_CONFIRMED', 'Confirm the interview schedule before recording final results.');
    }
    if (resultsState.published) {
      return sendError(res, req, pathname, 409, 'RESULTS_ALREADY_PUBLISHED', 'Final results are already published and locked.');
    }

    const appId = decodeURIComponent(resultMatch[1]);
    const isEligible = schedule.assignments.some((a) => a.applicationId === appId && a.status !== 'unassigned');
    const app = applications.find((a) => a.id === appId);
    if (!app || !isEligible) {
      return sendError(res, req, pathname, 404, 'NOT_FOUND', `Eligible application ${appId} was not found.`);
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid JSON request body.');
    }

    const fields = {};
    if (!['pass', 'fail'].includes(body.finalResult)) {
      fields.finalResult = 'Final result must be "pass" or "fail".';
    }
    const decisionNote = body.decisionNote === undefined ? '' : body.decisionNote;
    if (typeof decisionNote !== 'string' || decisionNote.length > 500) {
      fields.decisionNote = 'Decision note must not exceed 500 characters.';
    }
    if (Object.keys(fields).length) {
      return sendError(res, req, pathname, 400, 'VALIDATION_ERROR', 'Invalid final result input.', fields);
    }

    app.finalResult = body.finalResult;
    app.decisionNote = decisionNote;

    const items = eligibleResultItems();
    const item = items.find((i) => i.applicationId === appId);
    sendJson(res, req, pathname, 200, {
      item,
      summary: computeResultsSummary(items)
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/notifications') {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    if (MOCK_MODE === 'empty') {
      sendJson(res, req, pathname, 200, { unreadCount: 0, notifications: [] });
      return;
    }
    const mine = notifications.filter((n) => n.userId === user.id).map(publicNotificationView);
    const unreadCount = mine.filter((n) => !n.isRead).length;
    sendJson(res, req, pathname, 200, { unreadCount, notifications: mine });
    return;
  }

  const notifReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (method === 'PATCH' && notifReadMatch) {
    const user = authenticate(req);
    if (!user) return sendError(res, req, pathname, 401, 'UNAUTHORIZED', 'Authentication required.');
    const notifId = decodeURIComponent(notifReadMatch[1]);
    const notif = notifications.find((n) => n.id === notifId);
    if (!notif) {
      return sendError(res, req, pathname, 404, 'NOT_FOUND', `Notification ${notifId} was not found.`);
    }
    if (notif.userId !== user.id) {
      return sendError(res, req, pathname, 403, 'FORBIDDEN', 'You may only modify your own notifications.');
    }
    notif.isRead = true;
    sendJson(res, req, pathname, 200, { notification: publicNotificationView(notif) });
    return;
  }

  sendError(res, req, pathname, 404, 'NOT_FOUND', `Route ${method} ${pathname} not found.`);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    const pathname = (() => {
      try {
        return new URL(req.url, `http://localhost:${PORT}`).pathname;
      } catch {
        return req.url || '/';
      }
    })();
    console.error(err);
    if (!res.headersSent) {
      sendError(res, req, pathname, 500, 'INTERNAL_ERROR', 'Unexpected mock server error.');
    }
  });
});

server.listen(PORT, () => {
  console.log(`ClubFlow mock API listening on http://localhost:${PORT} (MOCK_MODE=${MOCK_MODE})`);
});
