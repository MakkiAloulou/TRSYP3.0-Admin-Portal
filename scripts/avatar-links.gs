// Google Apps Script for the badge sheet (Participation), not run by the repo.
// Paste it into the sheet's Extensions > Apps Script, set AVATAR_FOLDER_ID and
// run fillAvatarLinks.
//
// Fills an "avatar" column with each participant's Drive link, the way the
// "QR codes" column holds theirs, from the folder of <participant_id>.svg files
// that scripts/export-avatars.mjs writes. Every sheet with a participant_id
// header gets one, right after its QR codes column. Running it again
// overwrites that column, so re-upload and re-run after a new export.

// The id at the end of the folder's URL: drive.google.com/drive/folders/<id>
const AVATAR_FOLDER_ID = 'PASTE_FOLDER_ID_HERE';

function fillAvatarLinks() {
  const links = {};
  const files = DriveApp.getFolderById(AVATAR_FOLDER_ID).getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (name.endsWith('.svg')) {
      links[name.slice(0, -4)] = 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=drive_link';
    }
  }

  const report = [];
  for (const sheet of SpreadsheetApp.getActiveSpreadsheet().getSheets()) {
    const lastColumn = sheet.getLastColumn();
    if (lastColumn === 0) continue;
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map((h) => String(h).trim().toLowerCase());
    const idColumn = headers.indexOf('participant_id') + 1;
    if (!idColumn) continue;

    // Reuse the column on a re-run; otherwise insert it after QR codes, which
    // pushes any notes further right instead of writing over them.
    let avatarColumn = headers.indexOf('avatar') + 1;
    if (!avatarColumn) {
      const after = headers.indexOf('qr codes') + 1 || idColumn;
      sheet.insertColumnAfter(after);
      avatarColumn = after + 1;
      sheet.getRange(1, avatarColumn).setValue('avatar');
    }

    const rowCount = sheet.getLastRow() - 1;
    if (rowCount < 1) continue;
    const ids = sheet.getRange(2, idColumn, rowCount, 1).getValues();
    const missing = [];
    const values = ids.map(([id], i) => {
      const key = String(id).trim();
      if (!key) return [''];
      if (!links[key]) missing.push('row ' + (i + 2) + ' (' + key + ')');
      return [links[key] || ''];
    });
    sheet.getRange(2, avatarColumn, rowCount, 1).setValues(values);
    report.push(sheet.getName() + ': ' + (missing.length ? 'no file for ' + missing.join(', ') : 'all linked'));
  }

  Logger.log(report.join('\n'));
}
