/* DEMO DATA. Every record here is invented for the prototype. Nothing is read from a live system.
   Text fields are [English, Arabic] pairs; read them with l(). */
const PROJECTS = {
  rt: { id:'rt', name:['Retail Tower OS','Retail Tower OS'], icon:'store', tone:'', hasEng:true,
    desc:['Retail operations platform','منصة عمليات التجزئة'],
    status:'review', focus:['Release readiness','جاهزية الإصدار'], key:['1 decision pending','قرار واحد معلّق'],
    ms:{done:6,total:9}, risks:2, ver:'v0.9.4', next:['Pilot go/no-go · Nov 18','قرار الانطلاق التجريبي · 18 نوفمبر'],
    eng:['Backend build failing on main','فشل بناء الخدمة الخلفية على الفرع الرئيسي'],
    biz:['4 of 12 pilot branches affected (demo)','4 من 12 فرعًا تجريبيًا متأثرة (تجريبي)'],
    plain:['A build problem is being fixed. Pilot branches may see slower stock updates.','هناك مشكلة في البناء قيد المعالجة. قد تتأخر تحديثات المخزون في الفروع التجريبية.'] },
  kh: { id:'kh', name:['Khepri','Khepri'], icon:'scarab', tone:'teal', hasEng:true,
    desc:['Data & automation platform','منصة البيانات والأتمتة'],
    status:'unavailable', focus:['Service health','صحة الخدمة'], key:['Verify data sources','تحقق من مصادر البيانات'],
    ms:{done:4,total:7}, risks:1, ver:'v0.4.2', next:['Incident review · Nov 17','مراجعة الحادث · 17 نوفمبر'],
    eng:['No telemetry read for Khepri','لا توجد قراءات قياس لـ Khepri'],
    biz:['Impact on customers: unknown','الأثر على العملاء: غير معروف'],
    plain:['We cannot see how Khepri is doing right now. This is unknown, not healthy.','لا يمكننا رؤية حالة Khepri الآن. هذا غير معروف وليس سليمًا.'] },
  se: { id:'se', name:['Seshat-BI','Seshat-BI'], icon:'eye', tone:'blue', hasEng:false,
    desc:['Analytics & business intelligence','التحليلات وذكاء الأعمال'],
    status:'planning', focus:['Requirements & design','المتطلبات والتصميم'], key:['Confirm scope','تأكيد النطاق'],
    ms:{done:2,total:6}, risks:1, ver:'v0.2.1', next:['Scope sign-off · Nov 30','اعتماد النطاق · 30 نوفمبر'],
    eng:['A release candidate is ready for review','نسخة مرشحة جاهزة للمراجعة'],
    biz:['First dashboards planned for Q1','أول لوحات المؤشرات مخططة للربع الأول'],
    plain:['Planning is on schedule. A scope decision is needed from the Owner.','التخطيط يسير حسب الجدول. مطلوب قرار على النطاق من المالك.'] }
};
const STATUS = {
  review:['Needs review','يحتاج مراجعة','b-warn','alert'],
  unavailable:['Data unavailable','البيانات غير متاحة','b-unk','help'],
  planning:['Planning','قيد التخطيط','b-info','info'],
  ok:['On track','على المسار','b-ok','check'],
  stale:['Stale data','بيانات قديمة','b-warn','clock']
};

/* Engineering signals. age in minutes. */
const SIGNALS = [
  { id:'S1', proj:'rt', sev:'crit', age:42, src:['CI pipeline (sample)','خط التكامل (عينة)'],
    t:['Build failed on main: Backend service','فشل البناء على الفرع الرئيسي: الخدمة الخلفية'],
    d:['The CI pipeline failed on main.','فشل خط التكامل المستمر على الفرع الرئيسي.'],
    plain:['A build problem was found and is being looked at.','تم رصد مشكلة في البناء ويجري فحصها.'],
    links:[['CI run #4821 (sample)','تشغيل CI رقم 4821 (عينة)'],['Logs (sample)','السجلات (عينة)']], inv:'INV-418' },
  { id:'S2', proj:'kh', sev:'warn', age:77, src:['Monitoring (sample)','المراقبة (عينة)'],
    t:['High error rate: ingest API','ارتفاع معدل الأخطاء: واجهة الاستقبال'],
    d:['5xx rate rose on the ingest endpoint.','ارتفع معدل أخطاء 5xx على نقطة الاستقبال.'],
    plain:['A service is slower than usual. Source data is incomplete.','إحدى الخدمات أبطأ من المعتاد. بيانات المصدر ناقصة.'],
    links:[['Monitoring (sample)','المراقبة (عينة)'],['Ticket KHE-DEMO-1','التذكرة KHE-DEMO-1']], inv:'INV-402' },
  { id:'S3', proj:'se', sev:'info', age:125, src:['CI summary (sample)','ملخص CI (عينة)'],
    t:['Release candidate v0.9.0 built','تم بناء النسخة المرشحة v0.9.0'],
    d:['RC built and ready for review.','النسخة المرشحة جاهزة للمراجعة.'],
    plain:['A new version is ready for the team to review.','نسخة جديدة جاهزة لمراجعة الفريق.'],
    links:[['Release (sample)','الإصدار (عينة)'],['CI summary (sample)','ملخص CI (عينة)']], inv:null }
];

const RISKS = [
  { id:'R1', proj:'rt', lvl:'high', blk:true, t:['Sync backlog may delay pilot branches','قد يؤخر تراكم المزامنة الفروع التجريبية'], own:['Delivery','التسليم'], src:['Investigation INV-418','التحقيق INV-418'], unk:false },
  { id:'R2', proj:'rt', lvl:'med', blk:false, t:['Receipt printer driver untested on new hardware','لم يُختبر تعريف الطابعة على الأجهزة الجديدة'], own:['QA','الجودة'], src:['Test plan (sample)','خطة الاختبار (عينة)'], unk:false },
  { id:'R3', proj:'kh', lvl:'high', blk:true, t:['Error rate unexplained: telemetry gap','معدل الأخطاء غير مفسَّر: فجوة في القياس'], own:['Platform','المنصة'], src:['No data read','لا توجد بيانات'], unk:true },
  { id:'R4', proj:'se', lvl:'med', blk:false, t:['Data source contract not yet agreed','عقد مصدر البيانات لم يُتفق عليه بعد'], own:['Product','المنتج'], src:['Scope notes (sample)','ملاحظات النطاق (عينة)'], unk:false }
];

const MILESTONES = [
  { id:'M1', proj:'kh', d:'Nov 17', t:['Incident review','مراجعة الحادث'], st:'warn', note:['Needs telemetry first','يحتاج قياسات أولًا'] },
  { id:'M2', proj:'rt', d:'Nov 18', t:['Pilot go/no-go','قرار الانطلاق التجريبي'], st:'warn', note:['Depends on sync fix','يعتمد على إصلاح المزامنة'] },
  { id:'M3', proj:'rt', d:'Nov 25', t:['Offline mode hardening','تقوية وضع عدم الاتصال'], st:'ok', note:['On track','على المسار'] },
  { id:'M4', proj:'se', d:'Nov 30', t:['Scope sign-off','اعتماد النطاق'], st:'info', note:['Awaiting decision D3','بانتظار القرار D3'] },
  { id:'M5', proj:'kh', d:'Dec 9', t:['v0.5 beta','الإصدار التجريبي v0.5'], st:'unk', note:['Date not confirmed','الموعد غير مؤكد'] }
];

const DEPS = [
  { from:'se', to:'kh', t:['Seshat-BI reads Khepri data exports','يقرأ Seshat-BI تصديرات بيانات Khepri'], st:'unk', note:['Blocked: Khepri data unavailable','معطّل: بيانات Khepri غير متاحة'] },
  { from:'rt', to:'kh', t:['Retail Tower OS uses Khepri nightly automation','يستخدم Retail Tower OS أتمتة Khepri الليلية'], st:'unk', note:['Health unknown: no telemetry','الحالة غير معروفة: لا قياسات'] },
  { from:'se', to:'rt', t:['Seshat-BI reads sales summaries from Retail Tower OS','يقرأ Seshat-BI ملخصات المبيعات من Retail Tower OS'], st:'warn', note:['Sync issue may delay summaries','قد تؤخر مشكلة المزامنة الملخصات'] },
  { from:'kh', to:'rt', t:['Khepri triggers Retail Tower OS catalog refresh','يشغّل Khepri تحديث كتالوج Retail Tower OS'], st:'ok', note:['Last run succeeded (demo)','آخر تشغيل ناجح (تجريبي)'] },
  { from:'rt', to:'se', t:['Retail Tower OS exports events for dashboards','يصدّر Retail Tower OS أحداثًا للوحات المؤشرات'], st:'info', note:['Planned for Q1','مخطط للربع الأول'] }
];

const TRAJ = { // milestones, cumulative, 8 weekly points (demo)
  x:['Sep 27','Oct 4','Oct 11','Oct 18','Oct 25','Nov 1','Nov 8','Nov 15'],
  planned:[2,4,7,10,13,16,18,20], done:[2,4,6,8,10,11,12,12], total:22
};
const QUEUE = { // INV-418 queue depth, thousands, every 15 min over 3 h
  x:['-3h','-2h45','-2h30','-2h15','-2h','-1h45','-1h30','-1h15','-1h','-45m','-30m','-15m','now'],
  y:[0.4,0.4,0.5,0.6,1.2,2.0,2.9,3.6,4.4,5.2,5.9,6.4,6.8], thr:5
};

/* Decisions. status: inbox | review | decided */
const DECISIONS = [
  { id:'D1', p:1, proj:'rt', st:'inbox', est:10, impact:'high', inv:'INV-418',
    t:['Approve go/no-go for the Retail Tower OS pilot release (v0.9.4)','الموافقة على قرار الانطلاق لإصدار Retail Tower OS التجريبي (v0.9.4)'],
    why:['The release candidate is ready, but the sync issue is still open.','النسخة المرشحة جاهزة لكن مشكلة المزامنة ما زالت مفتوحة.'],
    ev:['E1','E2','E3'], due:['Nov 18','18 نوفمبر'],
    opts:[
      {id:'go', rec:false, t:['Go','انطلاق'], d:['Release to 12 pilot branches on Nov 18.','إصدار للفروع التجريبية الـ12 في 18 نوفمبر.'], r:['Risk: sync delays reach branches.','الخطر: تأخر المزامنة يصل للفروع.']},
      {id:'hold', rec:true, t:['Hold 3 days','تأجيل 3 أيام'], d:['Fix sync capacity first, then re-check evidence.','إصلاح سعة المزامنة أولًا ثم إعادة فحص الأدلة.'], r:['Risk: pilot milestone slips by 3 days.','الخطر: تأخر معلم التجربة 3 أيام.']},
      {id:'part', rec:false, t:['Release to 4 branches','إصدار لـ4 فروع'], d:['Start with branches not affected by the issue.','البدء بالفروع غير المتأثرة بالمشكلة.'], r:['Risk: mixed versions to support.','الخطر: دعم إصدارات مختلطة.']} ] },
  { id:'D2', p:1, proj:'kh', st:'inbox', est:5, impact:'high', inv:'INV-402',
    t:['Confirm the Khepri incident response plan','تأكيد خطة الاستجابة لحادث Khepri'],
    why:['The error rate rose, but no telemetry confirms the cause.','ارتفع معدل الأخطاء لكن لا قياسات تؤكد السبب.'],
    ev:['E8'], due:['Nov 17','17 نوفمبر'],
    opts:[
      {id:'plan', rec:true, t:['Restore telemetry first','استعادة القياس أولًا'], d:['Reconnect monitoring, then investigate.','إعادة ربط المراقبة ثم التحقيق.'], r:['Risk: slower first answer.','الخطر: إجابة أولى أبطأ.']},
      {id:'roll', rec:false, t:['Roll back last change','التراجع عن آخر تغيير'], d:['Revert the most recent ingest change.','التراجع عن أحدث تغيير في الاستقبال.'], r:['Risk: cause is not confirmed.','الخطر: السبب غير مؤكد.']} ] },
  { id:'D3', p:2, proj:'se', st:'inbox', est:15, impact:'med', inv:null,
    t:['Confirm Seshat-BI scope for the first dashboards','تأكيد نطاق Seshat-BI للوحات المؤشرات الأولى'],
    why:['Engineering needs scope to estimate Q1 work.','تحتاج الهندسة النطاق لتقدير أعمال الربع الأول.'],
    ev:['E9'], due:['Nov 30','30 نوفمبر'],
    opts:[
      {id:'a', rec:true, t:['Sales and stock only','المبيعات والمخزون فقط'], d:['Two dashboards, one data source.','لوحتان ومصدر بيانات واحد.'], r:['Risk: finance asks for more later.','الخطر: قد تطلب المالية المزيد لاحقًا.']},
      {id:'b', rec:false, t:['Add finance','إضافة المالية'], d:['Three dashboards, two sources.','ثلاث لوحات ومصدران.'], r:['Risk: depends on an unconfirmed contract.','الخطر: يعتمد على عقد غير مؤكد.']} ] },
  { id:'D4', p:2, proj:'rt', st:'inbox', est:8, impact:'med', inv:'INV-418',
    t:['Increase sync worker capacity before pilot expansion','زيادة سعة عمال المزامنة قبل توسيع التجربة'],
    why:['Capacity looks too low under load (inferred, 72%).','السعة تبدو منخفضة تحت الحمل (استنتاج، 72%).'],
    ev:['E2','E4','E5'], due:['Nov 19','19 نوفمبر'],
    opts:[
      {id:'scale', rec:true, t:['Raise from 2 to 8 workers','رفع العمال من 2 إلى 8'], d:['Restore the earlier setting in staging first.','استعادة الإعداد السابق في بيئة الاختبار أولًا.'], r:['Risk: higher cost, small.','الخطر: تكلفة أعلى، صغيرة.']},
      {id:'wait', rec:false, t:['Wait for verification','انتظار التحقق'], d:['Confirm the cause before changing anything.','تأكيد السبب قبل تغيير أي شيء.'], r:['Risk: backlog keeps growing.','الخطر: يستمر التراكم بالنمو.']} ] },
  { id:'D5', p:3, proj:'kh', st:'inbox', est:5, impact:'low', inv:null,
    t:['Approve extra cloud budget for load tests','الموافقة على ميزانية سحابية إضافية لاختبارات الحمل'],
    why:['Load tests before the v0.5 beta need more capacity. Estimate $450.','تحتاج اختبارات الحمل قبل v0.5 سعة أكبر. التقدير 450$.'],
    ev:[], due:['Dec 1','1 ديسمبر'],
    opts:[
      {id:'ok', rec:true, t:['Approve $450','الموافقة على 450$'], d:['One-time spend for two weeks.','إنفاق لمرة واحدة لمدة أسبوعين.'], r:['Risk: none identified.','الخطر: لا يوجد.']},
      {id:'no', rec:false, t:['Use smaller tests','اختبارات أصغر'], d:['Run at 40% scale.','التشغيل بحجم 40%.'], r:['Risk: weaker evidence.','الخطر: أدلة أضعف.']} ] },
  { id:'D8', p:2, proj:'rt', st:'review', est:10, impact:'med', inv:null,
    t:['Set the refund approval threshold for pilot stores','تحديد حد اعتماد المرتجعات للمتاجر التجريبية'],
    why:['Waiting on the finance review (demo).','بانتظار مراجعة المالية (تجريبي).'], ev:[], due:['Nov 20','20 نوفمبر'],
    opts:[{id:'x', rec:true, t:['Threshold 500','الحد 500'], d:['Above this, a manager approves.','فوق هذا المبلغ يعتمد المدير.'], r:['Risk: low.','الخطر: منخفض.']}] },
  { id:'D6', p:2, proj:'rt', st:'decided', outcome:'approved', est:6, impact:'med', inv:null,
    t:['Freeze the catalog schema for the pilot','تجميد مخطط الكتالوج للتجربة'],
    why:['Decided on Nov 14 (demo).','تم القرار في 14 نوفمبر (تجريبي).'], ev:[], due:['Nov 14','14 نوفمبر'],
    opts:[{id:'f', rec:true, t:['Freeze','تجميد'], d:['No schema changes until the pilot ends.','لا تغييرات على المخطط حتى نهاية التجربة.'], r:['Risk: low.','الخطر: منخفض.']}] },
  { id:'D7', p:3, proj:'rt', st:'decided', outcome:'deferred', est:4, impact:'low', inv:null,
    t:['Arabic receipt template for v0.9','قالب الإيصال العربي للإصدار v0.9'],
    why:['Deferred to v0.10 on Nov 13 (demo).','أُجّل إلى v0.10 في 13 نوفمبر (تجريبي).'], ev:[], due:['Nov 13','13 نوفمبر'],
    opts:[{id:'d', rec:true, t:['Defer','تأجيل'], d:['Move to v0.10.','نقل إلى v0.10.'], r:['Risk: low.','الخطر: منخفض.']}] }
];

/* Evidence. kind: obs | inf | unk. src icon key. */
const EVIDENCE = {
  E1:{ inv:'INV-418', kind:'obs', ic:'bug', age:14, src:['Error tracker (sample)','متتبع الأخطاء (عينة)'],
    t:['Timeout errors on branch sync push','أخطاء انتهاء مهلة في دفع مزامنة الفروع'],
    sum:['312 timeouts in 30 min. First seen 2 h 14 min ago.','312 انتهاء مهلة في 30 دقيقة. أول ظهور قبل ساعتين و14 دقيقة.'],
    raw:'ConnectTimeout: sync.push exceeded 30000 ms\n  branch=NM-02 attempt=3 queue=sync-out\n  count_30m=312 first_seen=2026-11-15T10:11Z\n  (sample payload, not a real error)' },
  E2:{ inv:'INV-418', kind:'obs', ic:'activity', age:3, src:['Monitoring (sample)','المراقبة (عينة)'],
    t:['Message queue depth is above the 5k threshold','عمق طابور الرسائل فوق حد 5 آلاف'],
    sum:['Depth is 6.8k and still rising.','العمق 6.8 ألف وما زال يرتفع.'],
    raw:'monitor: sync-queue-depth\n  value=6812 threshold=5000 trend=rising\n  window=15m sample=true' },
  E3:{ inv:'INV-418', kind:'obs', ic:'branch', age:42, src:['CI pipeline (sample)','خط التكامل (عينة)'],
    t:['CI run failed on main: Backend service','فشل تشغيل CI على الفرع الرئيسي: الخدمة الخلفية'],
    sum:['Integration test for sync retries failed.','فشل اختبار التكامل لإعادة محاولات المزامنة.'],
    raw:'run #4821 (sample)\n  job=integration status=failed\n  test="sync retries under load"\n  duration=8m12s' },
  E4:{ inv:'INV-418', kind:'obs', ic:'rocket', age:151, src:['Deployment log (sample)','سجل النشر (عينة)'],
    t:['Worker concurrency changed from 8 to 2','تغيّر تزامن العمال من 8 إلى 2'],
    sum:['A config change shipped 17 min before the first timeout.','نُشر تغيير إعداد قبل أول انتهاء مهلة بـ17 دقيقة.'],
    raw:'deploy cfg-9912 (sample)\n  sync.worker.concurrency: 8 -> 2\n  author=deploy-bot at=2026-11-15T09:54Z' },
  E5:{ inv:'INV-418', kind:'inf', ic:'sparkles', age:3, conf:72, src:['AI-assisted analysis (demo)','تحليل بمساعدة الذكاء الاصطناعي (تجريبي)'],
    t:['Queue backpressure is causing the sync timeouts','ضغط الطابور هو سبب انتهاء مهل المزامنة'],
    sum:['Based on E1, E2 and E4. Not confirmed by a test.','مبني على E1 وE2 وE4. لم يُؤكد باختبار.'],
    raw:'inference: backpressure -> timeouts\n  confidence=0.72 basis=[E1,E2,E4]\n  status=unverified' },
  E6:{ inv:'INV-418', kind:'unk', ic:'help', age:null, src:['No source','لا يوجد مصدر'],
    t:['POS terminal connectivity','اتصال أجهزة نقاط البيع'],
    sum:['Not instrumented. Unknown, not healthy.','غير مزوَّدة بالقياس. غير معروف وليس سليمًا.'], raw:'(no data)' },
  E7:{ inv:'INV-418', kind:'unk', ic:'file', age:null, src:['Work tracker (sample)','متتبع العمل (عينة)'],
    t:['Existing work item for this issue','بند عمل قائم لهذه المشكلة'],
    sum:['No verified owner found. Candidates are text matches only.','لا يوجد مالك مؤكد. المرشحون مطابقات نصية فقط.'], raw:'(no verified link)' },
  E8:{ inv:'INV-402', kind:'unk', ic:'activity', age:null, src:['Monitoring (sample)','المراقبة (عينة)'],
    t:['Khepri ingest telemetry','قياسات استقبال Khepri'],
    sum:['Source not read. We do not know the current error rate.','لم تُقرأ البيانات. لا نعرف معدل الأخطاء الحالي.'], raw:'(source unavailable)' },
  E9:{ inv:null, kind:'obs', ic:'file', age:300, src:['Scope notes (sample)','ملاحظات النطاق (عينة)'],
    t:['Draft scope for two dashboards','مسودة نطاق لوحتين'],
    sum:['Sales and stock, one data source.','المبيعات والمخزون، مصدر بيانات واحد.'], raw:'scope-draft v3 (sample)' },
  E10:{ inv:'INV-411', kind:'obs', ic:'activity', age:58, src:['Monitoring (sample)','المراقبة (عينة)'],
    t:['Report query p95 is 14 s','زمن الاستعلام p95 هو 14 ثانية'],
    sum:['Target is 4 s. Slow since Nov 14.','الهدف 4 ثوانٍ. بطيء منذ 14 نوفمبر.'], raw:'report.query p95=14.1s target=4s (sample)' },
  E11:{ inv:'INV-411', kind:'inf', ic:'sparkles', age:58, conf:55, src:['AI-assisted analysis (demo)','تحليل بمساعدة الذكاء الاصطناعي (تجريبي)'],
    t:['A missing index on the sales table','فهرس مفقود في جدول المبيعات'],
    sum:['Plausible, 55% confidence. Needs a query plan.','محتمل بثقة 55%. يحتاج خطة استعلام.'], raw:'inference: missing index (sample)' }
};

const INVESTIGATIONS = {
  'INV-418':{ id:'INV-418', proj:'rt', sev:'high', status:'ongoing', started:134,
    t:['Pilot sync failures between branches','فشل المزامنة بين الفروع التجريبية'],
    scope:['4 of 12 pilot branches (demo)','4 من 12 فرعًا تجريبيًا (تجريبي)'],
    ev:['E1','E2','E3','E4','E5','E6','E7'],
    impact:['Branches may see delayed stock updates. Sales still complete at the till.','قد تتأخر تحديثات المخزون في الفروع. البيع ما زال يكتمل عند الصندوق.'],
    plain:['Some stores may see stock numbers update late. Selling is not blocked.','قد تتأخر أرقام المخزون في بعض المتاجر. البيع غير متوقف.'],
    cause:['Message queue backpressure after worker concurrency dropped from 8 to 2.','ضغط على طابور الرسائل بعد انخفاض تزامن العمال من 8 إلى 2.'],
    summary:['Timeouts began 17 min after a config change. Queue depth rose in step. A test has not yet confirmed the link.','بدأت انتهاءات المهلة بعد 17 دقيقة من تغيير الإعداد. ارتفع عمق الطابور بالتزامن. لم يؤكد اختبار الصلة بعد.'],
    observed:[['Timeouts: 312 in 30 min','انتهاءات المهلة: 312 في 30 دقيقة'],['Queue depth 6.8k, above 5k','عمق الطابور 6.8 ألف فوق 5 آلاف'],['Worker concurrency 8 → 2','تزامن العمال 8 ← 2'],['CI failed on main 42 min ago','فشل CI على الفرع الرئيسي قبل 42 دقيقة']],
    inferred:[['Backpressure causes timeouts (72%)','الضغط يسبب انتهاء المهلة (72%)'],['4 branches affected, based on error tags','4 فروع متأثرة بحسب وسوم الأخطاء']],
    unknown:[['POS terminal connectivity','اتصال أجهزة نقاط البيع'],['Owner of an existing work item','مالك بند عمل قائم']],
    next:['Draft a Verification item: reproduce the timeout in staging with 8 workers.','صياغة بند تحقق: إعادة إنتاج انتهاء المهلة في بيئة الاختبار بثمانية عمال.'],
    nodes:[
      {id:'pos',x:20,y:150,w:130,n:['POS Client','عميل نقطة البيع'],s:'unk',st:['Not instrumented','غير مزوَّد بقياس'],ev:'E6',own:['Retail team','فريق التجزئة']},
      {id:'sync',x:250,y:150,w:140,n:['Sync Service','خدمة المزامنة'],s:'crit',st:['Degraded','متدهورة'],ev:'E1',own:['Platform','المنصة']},
      {id:'br',x:490,y:36,w:150,n:['Branch Service','خدمة الفروع'],s:'ok',st:['Healthy','سليمة'],ev:null,own:['Retail team','فريق التجزئة']},
      {id:'inv',x:490,y:150,w:150,n:['Inventory Service','خدمة المخزون'],s:'warn',st:['Updates delayed','التحديثات متأخرة'],ev:'E3',own:['Retail team','فريق التجزئة']},
      {id:'rep',x:490,y:264,w:150,n:['Reporting','التقارير'],s:'warn',st:['Stale: 9 h','قديمة: 9 س'],ev:null,own:['Analytics','التحليلات']},
      {id:'q',x:250,y:290,w:140,n:['Message Queue','طابور الرسائل'],s:'crit',st:['Suspected cause','سبب مشتبه'],ev:'E2',own:['Platform','المنصة']},
      {id:'db',x:20,y:290,w:130,n:['Database','قاعدة البيانات'],s:'ok',st:['Healthy','سليمة'],ev:null,own:['Platform','المنصة']}
    ],
    edges:[['pos','sync','obs',0],['sync','br','obs',0],['sync','inv','obs',0],['sync','rep','inf',0],['sync','q','obs',1],['q','db','inf',0]],
    timeline:[
      {ago:151,k:'obs',t:['Worker concurrency changed 8 → 2','تغيّر تزامن العمال 8 ← 2'],d:['Deploy cfg-9912 (sample).','نشر cfg-9912 (عينة).']},
      {ago:134,k:'crit',t:['First sync timeout','أول انتهاء مهلة مزامنة'],d:['Branch NM-02 push exceeded 30 s.','تجاوز دفع الفرع NM-02 مدة 30 ثانية.']},
      {ago:105,k:'warn',t:['Queue depth passed 5k','تجاوز عمق الطابور 5 آلاف'],d:['Monitor entered alert state.','دخل المراقب حالة التنبيه.']},
      {ago:42,k:'crit',t:['CI failed on main','فشل CI على الفرع الرئيسي'],d:['Sync retry integration test.','اختبار تكامل إعادة محاولات المزامنة.']},
      {ago:14,k:'warn',t:['Error rate peaked','بلغ معدل الأخطاء ذروته'],d:['312 timeouts in the last 30 min.','312 انتهاء مهلة في آخر 30 دقيقة.']},
      {ago:3,k:'ai',t:['AI analysis updated (read-only)','تحديث تحليل الذكاء الاصطناعي (قراءة فقط)'],d:['Hypothesis confidence 72%.','ثقة الفرضية 72%.']}
    ],
    related:[
      {k:'dec',id:'D1'},{k:'dec',id:'D4'},{k:'risk',id:'R1'},{k:'sig',id:'S1'}
    ] },
  'INV-411':{ id:'INV-411', proj:'se', sev:'med', status:'monitoring', started:1440,
    t:['Slow report generation','بطء إنشاء التقارير'], scope:['Reports over 30 days (demo)','التقارير لأكثر من 30 يومًا (تجريبي)'],
    ev:['E10','E11'],
    impact:['Reports take longer to open. No data is lost.','تفتح التقارير ببطء أكبر. لا فقدان للبيانات.'],
    plain:['Some reports open slowly. Nothing is lost.','تفتح بعض التقارير ببطء. لا شيء مفقود.'],
    cause:['A missing index on the sales table (not confirmed).','فهرس مفقود في جدول المبيعات (غير مؤكد).'],
    summary:['Slow since Nov 14. The cause is a guess until a query plan is read.','بطء منذ 14 نوفمبر. السبب تخمين حتى تُقرأ خطة الاستعلام.'],
    observed:[['Report query p95 14 s','زمن استعلام التقرير p95 هو 14 ث']],
    inferred:[['Missing index (55%)','فهرس مفقود (55%)']],
    unknown:[['Row count growth','نمو عدد الصفوف']],
    next:['Read the query plan for the slowest report (read-only).','قراءة خطة الاستعلام لأبطأ تقرير (قراءة فقط).'],
    nodes:[
      {id:'api',x:20,y:150,w:130,n:['Report API','واجهة التقارير'],s:'warn',st:['Slow','بطيئة'],ev:'E10',own:['Analytics','التحليلات']},
      {id:'qe',x:250,y:150,w:140,n:['Query Engine','محرك الاستعلام'],s:'crit',st:['Suspected','مشتبه'],ev:'E11',own:['Analytics','التحليلات']},
      {id:'wh',x:490,y:80,w:150,n:['Warehouse','المستودع'],s:'unk',st:['Not read','غير مقروء'],ev:null,own:['Platform','المنصة']},
      {id:'ca',x:490,y:230,w:150,n:['Cache','الذاكرة المؤقتة'],s:'ok',st:['Healthy','سليمة'],ev:null,own:['Platform','المنصة']}
    ],
    edges:[['api','qe','obs',1],['qe','wh','inf',0],['qe','ca','obs',0]],
    timeline:[
      {ago:1500,k:'obs',t:['Slowdown begins','بدء البطء'],d:['p95 passes 8 s.','تجاوز p95 مدة 8 ث.']},
      {ago:58,k:'warn',t:['p95 reaches 14 s','وصول p95 إلى 14 ث'],d:['Target is 4 s.','الهدف 4 ث.']}
    ],
    related:[{k:'risk',id:'R4'}] },
  'INV-402':{ id:'INV-402', proj:'kh', sev:'med', status:'noevidence', started:77,
    t:['High error rate on the ingest API','ارتفاع معدل الأخطاء في واجهة الاستقبال'], scope:['Unknown','غير معروف'],
    ev:['E8'], empty:true,
    impact:['Unknown. No telemetry was read.','غير معروف. لم تُقرأ أي قياسات.'],
    plain:['We cannot say how big the problem is. No data was read.','لا يمكننا تحديد حجم المشكلة. لم تُقرأ أي بيانات.'],
    cause:['Unknown','غير معروف'], summary:['Nothing can be concluded yet.','لا يمكن استنتاج شيء بعد.'],
    observed:[], inferred:[], unknown:[['Current error rate','معدل الأخطاء الحالي'],['Affected customers','العملاء المتأثرون']],
    next:['Restore the monitoring connection, then re-read.','استعادة اتصال المراقبة ثم إعادة القراءة.'],
    nodes:[], edges:[], timeline:[{ago:77,k:'warn',t:['Alert received','استلام تنبيه'],d:['Source later became unreadable.','أصبح المصدر لاحقًا غير قابل للقراءة.']}],
    related:[{k:'dec',id:'D2'},{k:'risk',id:'R3'},{k:'sig',id:'S2'}] }
};

/* Simulated agents. Nothing here is connected to anything. */
const AGENTS = [
  { id:'A1', n:['Analyst','المحلل'], role:['Engineering analysis','التحليل الهندسي'], icon:'activity', mode:'read', st:'running', cost:6.2, runs:14,
    task:['Correlate sync failures with recent changes','ربط أعطال المزامنة بالتغييرات الأخيرة'], prog:72,
    caps:[['Summarize CI and monitoring evidence','تلخيص أدلة CI والمراقبة'],['Rank hypotheses with confidence','ترتيب الفرضيات بالثقة'],['Draft investigation notes','صياغة ملاحظات التحقيق']],
    perm:{gh:'r',jira:'r',mon:'r',conf:'r',jwrite:'n',merge:'n',deploy:'n',perms:'n'} },
  { id:'A2', n:['Planner','المخطط'], role:['Delivery planning','تخطيط التسليم'], icon:'calendar', mode:'read', st:'running', cost:4.1, runs:9,
    task:['Update milestone health summary','تحديث ملخص صحة المعالم'], prog:35,
    caps:[['Summarize milestones and risks','تلخيص المعالم والمخاطر'],['Flag slipping dates','تنبيه المواعيد المتأخرة']],
    perm:{gh:'r',jira:'r',mon:'n',conf:'r',jwrite:'n',merge:'n',deploy:'n',perms:'n'} },
  { id:'A3', n:['Release Reviewer','مراجع الإصدارات'], role:['Release checks','فحوص الإصدار'], icon:'shield', mode:'read', st:'idle', cost:3.3, runs:6,
    task:['Waiting for the next release candidate','بانتظار النسخة المرشحة التالية'], prog:0,
    caps:[['Check release notes against merged work','مطابقة ملاحظات الإصدار مع العمل المدمج'],['Summarize risk','تلخيص المخاطر']],
    perm:{gh:'r',jira:'r',mon:'r',conf:'n',jwrite:'n',merge:'n',deploy:'n',perms:'n'} },
  { id:'A4', n:['Ops Watch','مراقب التشغيل'], role:['Operations proposals','مقترحات التشغيل'], icon:'bars', mode:'propose', st:'approval', cost:4.8, runs:11,
    task:['Propose a sync worker scale-up','اقتراح زيادة عمال المزامنة'], prog:100,
    caps:[['Read monitoring','قراءة المراقبة'],['Propose a change for human review','اقتراح تغيير لمراجعة بشرية']],
    perm:{gh:'r',jira:'p',mon:'r',conf:'r',jwrite:'p',merge:'n',deploy:'p',perms:'n'} },
  { id:'A5', n:['Executor','المنفّذ'], role:['Authorized execution','التنفيذ المصرّح'], icon:'zap', mode:'exec', st:'off', cost:0, runs:0,
    task:['Off in this prototype','متوقف في هذا النموذج'], prog:0,
    caps:[['Run an approved change after explicit sign-off','تنفيذ تغيير معتمد بعد موافقة صريحة']],
    perm:{gh:'n',jira:'n',mon:'n',conf:'n',jwrite:'n',merge:'n',deploy:'n',perms:'n'} }
];
const PERMS = [
  ['gh',['Read GitHub','قراءة GitHub']],['jira',['Read Jira','قراءة Jira']],['mon',['Read monitoring','قراءة المراقبة']],
  ['conf',['Read Confluence','قراءة Confluence']],['jwrite',['Create or edit Jira items','إنشاء أو تعديل بنود Jira']],
  ['merge',['Merge a pull request','دمج طلب سحب']],['deploy',['Deploy','النشر']],['perms',['Change permissions','تغيير الصلاحيات']]
];
const HISTORY = [
  { id:'H1', a:'A1', st:'running', t:['Correlate sync failures with recent changes','ربط أعطال المزامنة بالتغييرات الأخيرة'], ago:12, out:['In progress (simulated)','قيد التنفيذ (محاكاة)'] },
  { id:'H2', a:'A2', st:'running', t:['Update milestone health summary','تحديث ملخص صحة المعالم'], ago:6, out:['In progress (simulated)','قيد التنفيذ (محاكاة)'] },
  { id:'H3', a:'A4', st:'approval', t:['Propose a sync worker scale-up','اقتراح زيادة عمال المزامنة'], ago:20, out:['Waiting for human approval','بانتظار موافقة بشرية'] },
  { id:'H4', a:'A3', st:'done', t:['Check v0.9.3 release notes','فحص ملاحظات الإصدار v0.9.3'], ago:240, out:['Completed: 2 notes flagged','اكتمل: تم تنبيه ملاحظتين'] },
  { id:'H5', a:'A1', st:'done', t:['Summarize Khepri alert history','تلخيص سجل تنبيهات Khepri'], ago:420, out:['Completed: no data for 6 h','اكتمل: لا بيانات منذ 6 ساعات'] },
  { id:'H6', a:'A2', st:'done', t:['Weekly delivery summary','ملخص التسليم الأسبوعي'], ago:1300, out:['Completed','اكتمل'] }
];
