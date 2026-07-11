/**
 * BYnarical Worktime — Google Apps Script 백엔드
 * ------------------------------------------------------------------
 * 하나의 Google 스프레드시트를 DB로 사용한다. 아래 시트 탭을 자동 생성한다.
 *   - Settings       : 키/값 (adminPasswordHash 등)
 *   - Workplaces     : 근무지 목록
 *   - Records        : 근태 기록
 *   - Leaves         : 연차 신청/승인
 *   - Confirmations  : 주간 전자서명
 *
 * 배포 방법
 *   1) 스프레드시트 → 확장 프로그램 → Apps Script 에 이 파일을 붙여넣는다.
 *   2) 배포 → 새 배포 → 유형: 웹 앱
 *        - 실행: 나
 *        - 액세스: 모든 사용자(익명 포함)
 *   3) 배포 후 나오는 /exec URL 을 앱 설정의 "Google Apps Script 웹앱 URL" 에 입력.
 *
 * CORS: 앱은 POST를 Content-Type: text/plain 으로 보내 프리플라이트를 회피한다.
 */

var SHEETS = {
  Settings: ['key', 'value', 'updatedAt'],
  Workplaces: ['id', 'name', 'lat', 'lng', 'radius'],
  Records: [
    'id', 'userId', 'userName', 'empNo', 'date', 'plannedStart',
    'checkIn', 'checkOut', 'type', 'workplaceId', 'workplaceName',
    'inLat', 'inLng', 'inVerified', 'outLat', 'outLng', 'outVerified',
    'note', 'hash', 'prevHash', 'updatedAt',
  ],
  Leaves: [
    'id', 'userId', 'userName', 'empNo', 'date', 'hours', 'segment',
    'startTime', 'endTime', 'reason', 'status', 'requestedAt',
    'decidedAt', 'decidedBy', 'decisionNote', 'hash', 'prevHash',
  ],
  Confirmations: [
    'id', 'userId', 'userName', 'weekStart', 'weekEnd', 'signature',
    'totalWorkedMinutes', 'summaryHash', 'confirmedAt', 'hash', 'prevHash',
  ],
};

function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SHEETS[name]);
  }
  if (sh.getLastRow() === 0) sh.appendRow(SHEETS[name]);
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// 헤더 기준으로 행을 객체로
function rowsToObjects_(sh) {
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var o = {};
    for (var j = 0; j < headers.length; j++) o[headers[j]] = values[i][j];
    out.push(o);
  }
  return out;
}

// id 로 upsert (없으면 append, 있으면 해당 행 갱신)
function upsert_(name, obj) {
  var sh = getSheet_(name);
  var headers = SHEETS[name];
  var idCol = headers.indexOf('id') + 1;
  var values = sh.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol - 1]) === String(obj.id)) {
      rowIndex = i + 1;
      break;
    }
  }
  var row = headers.map(function (h) {
    return obj[h] !== undefined && obj[h] !== null ? obj[h] : '';
  });
  if (rowIndex === -1) sh.appendRow(row);
  else sh.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
}

// AttendanceRecord → Records 행 객체 평탄화
function flattenRecord_(r) {
  return {
    id: r.id, userId: r.userId, userName: r.userName || '', empNo: r.empNo || '',
    date: r.date, plannedStart: r.plannedStart || '',
    checkIn: r.checkIn || '', checkOut: r.checkOut || '', type: r.type || 'WORK',
    workplaceId: r.workplaceId || '', workplaceName: r.workplaceName || '',
    inLat: r.inLocation ? r.inLocation.lat : '', inLng: r.inLocation ? r.inLocation.lng : '',
    inVerified: r.inVerified ? 'Y' : '', outLat: r.outLocation ? r.outLocation.lat : '',
    outLng: r.outLocation ? r.outLocation.lng : '', outVerified: r.outVerified ? 'Y' : '',
    note: r.note || '', hash: r.hash || '', prevHash: r.prevHash || '',
    updatedAt: r.updatedAt || '',
  };
}

function doGet(e) {
  var action = (e.parameter.action || '').toString();

  if (action === 'getSettings') {
    var settings = {};
    rowsToObjects_(getSheet_('Settings')).forEach(function (r) {
      settings[r.key] = r.value;
    });
    var workplaces = rowsToObjects_(getSheet_('Workplaces')).filter(function (w) {
      return w.id;
    }).map(function (w) {
      return { id: w.id, name: w.name, lat: Number(w.lat), lng: Number(w.lng), radius: Number(w.radius) };
    });
    return json_({
      ok: true,
      adminPasswordHash: settings.adminPasswordHash || '',
      workplaces: workplaces,
    });
  }

  if (action === 'getUserData') {
    var userId = (e.parameter.userId || '').toString();
    var records = rowsToObjects_(getSheet_('Records')).filter(function (r) { return r.userId === userId; });
    var leaves = rowsToObjects_(getSheet_('Leaves')).filter(function (r) { return r.userId === userId; });
    var confs = rowsToObjects_(getSheet_('Confirmations')).filter(function (r) { return r.userId === userId; });
    return json_({ ok: true, records: records, leaves: leaves, confirmations: confs });
  }

  return json_({ ok: false, error: 'unknown action: ' + action });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'invalid json' });
  }

  // 앱은 오프라인 큐를 { action:'sync', ops:[{action, payload}, ...] } 로 보낸다.
  if (body.action === 'sync' && Array.isArray(body.ops)) {
    var results = [];
    body.ops.forEach(function (op) {
      try {
        applyOp_(op);
        results.push({ id: op.id, ok: true });
      } catch (err) {
        results.push({ id: op.id, ok: false, error: String(err) });
      }
    });
    return json_({ ok: true, results: results });
  }

  // 단건도 허용
  try {
    applyOp_(body);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function applyOp_(op) {
  var p = op.payload !== undefined ? op.payload : op;
  switch (op.action) {
    case 'upsertRecord':
      upsert_('Records', flattenRecord_(p));
      break;
    case 'upsertLeave':
      upsert_('Leaves', p);
      break;
    case 'upsertConfirmation':
      upsert_('Confirmations', {
        id: p.id, userId: p.userId, userName: p.userName || '',
        weekStart: p.weekStart, weekEnd: p.weekEnd, signature: p.signature,
        totalWorkedMinutes: p.totalWorkedMinutes || 0, summaryHash: p.summaryHash || '',
        confirmedAt: p.confirmedAt || '', hash: p.hash || '', prevHash: p.prevHash || '',
      });
      break;
    case 'saveSettings':
      if (p.adminPasswordHash) {
        upsertSettingsByKey_('adminPasswordHash', p.adminPasswordHash);
      }
      if (Array.isArray(p.workplaces)) {
        var sh = getSheet_('Workplaces');
        sh.clear();
        sh.appendRow(SHEETS.Workplaces);
        p.workplaces.forEach(function (w) {
          sh.appendRow([w.id, w.name, w.lat, w.lng, w.radius]);
        });
      }
      break;
    default:
      throw new Error('unknown op action: ' + op.action);
  }
}

// Settings 시트는 key 컬럼을 id처럼 쓰기 위해 upsert 키를 맞춰준다.
function upsertSettingsByKey_(key, value) {
  var sh = getSheet_('Settings');
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === key) {
      sh.getRange(i + 1, 1, 1, 3).setValues([[key, value, new Date().toISOString()]]);
      return;
    }
  }
  sh.appendRow([key, value, new Date().toISOString()]);
}
