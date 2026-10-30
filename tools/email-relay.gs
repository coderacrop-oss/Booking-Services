// ตัวส่งอีเมลของระบบจอง (วางใน Apps Script ของบัญชี Google ที่จะใช้ส่ง)
// 1) Project Settings → Script Properties → เพิ่ม RELAY_KEY = รหัสยาว ๆ (ตัวเดียวกับ EMAIL_RELAY_KEY ใน Vercel)
// 2) Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone → คัดลอก URL ไปใส่ EMAIL_RELAY_URL
// โควตาส่งต่อวันตามที่ Google กำหนดให้บัญชีนั้น (ดู MailApp.getRemainingDailyQuota())
function doPost(e) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  try {
    var b = JSON.parse(e.postData.contents);
    var key = PropertiesService.getScriptProperties().getProperty('RELAY_KEY');
    if (!key || key.length < 16 || b.key !== key) return out({ ok: false, error: 'bad key' });
    var to = [].concat(b.to || []).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
    if (!to.length) return out({ ok: false, error: 'no recipient' });
    if (MailApp.getRemainingDailyQuota() < to.length) return out({ ok: false, error: 'quota' });
    MailApp.sendEmail({ to: to.join(','), subject: String(b.subject || '').slice(0, 200), body: String(b.text || ''), name: b.name || 'ระบบจอง' });
    return out({ ok: true, left: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out({ ok: false, error: String(err).slice(0, 200) });
  }
}

// กด Run ครั้งแรกเพื่ออนุญาตสิทธิ์ส่งอีเมล
function test() { Logger.log('เหลือส่งได้วันนี้: ' + MailApp.getRemainingDailyQuota()); }
