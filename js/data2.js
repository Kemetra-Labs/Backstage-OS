/* DEMO DATA, second set: the imagined customer layer of Retail Tower OS (company, branch, terminal) and
   richer investigation fields. All names are invented. No customer data exists in this prototype. */
const TENANTS = [
  { id:'NM', n:['Demo Grocer A','بقالة تجريبية أ'], sector:['Grocery chain','سلسلة بقالة'], br:['NM-01','NM-02','NM-03','NM-04','NM-05'] },
  { id:'DP', n:['Demo Pharmacy B','صيدلية تجريبية ب'], sector:['Pharmacy chain','سلسلة صيدليات'], br:['DP-01','DP-02','DP-03','DP-04'] },
  { id:'CH', n:['Demo Home Goods C','أدوات منزلية تجريبية ج'], sector:['Home goods','أدوات منزلية'], br:['CH-01','CH-02'] },
  { id:'AB', n:['Demo Bakery D','مخبز تجريبي د'], sector:['Bakery','مخبز'], br:['AB-01'] }
];
/* st: ok | delayed | new (not synced yet). sync = minutes since last sync (null = never). inst = terminal telemetry exists. */
const BRANCHES = {
  'NM-01':{t:'NM', n:['Zamalek','الزمالك'], st:'ok', sync:4, term:3, ver:'v0.9.3', inst:true, back:0},
  'NM-02':{t:'NM', n:['Maadi','المعادي'], st:'delayed', sync:96, term:2, ver:'v0.9.3', inst:false, back:null},
  'NM-03':{t:'NM', n:['Nasr City','مدينة نصر'], st:'delayed', sync:134, term:3, ver:'v0.9.3', inst:false, back:null},
  'NM-04':{t:'NM', n:['Heliopolis','مصر الجديدة'], st:'ok', sync:7, term:2, ver:'v0.9.3', inst:false, back:null},
  'NM-05':{t:'NM', n:['6th October','السادس من أكتوبر'], st:'new', sync:null, term:2, ver:'v0.9.4', inst:false, back:null},
  'DP-01':{t:'DP', n:['Mansoura','المنصورة'], st:'ok', sync:5, term:2, ver:'v0.9.3', inst:true, back:0},
  'DP-02':{t:'DP', n:['Tanta','طنطا'], st:'delayed', sync:71, term:1, ver:'v0.9.3', inst:false, back:null},
  'DP-03':{t:'DP', n:['Zagazig','الزقازيق'], st:'ok', sync:8, term:1, ver:'v0.9.3', inst:false, back:null},
  'DP-04':{t:'DP', n:['Damietta','دمياط'], st:'ok', sync:6, term:1, ver:'v0.9.3', inst:false, back:null},
  'CH-01':{t:'CH', n:['Dokki','الدقي'], st:'ok', sync:3, term:2, ver:'v0.9.3', inst:false, back:null},
  'CH-02':{t:'CH', n:['New Cairo','القاهرة الجديدة'], st:'delayed', sync:112, term:2, ver:'v0.9.3', inst:false, back:null},
  'AB-01':{t:'AB', n:['Smouha','سموحة'], st:'ok', sync:9, term:1, ver:'v0.9.3', inst:false, back:null}
};
const BR_ORDER = ['NM-01','NM-02','NM-03','NM-04','NM-05','DP-01','DP-02','DP-03','DP-04','CH-01','CH-02','AB-01'];
const BRST = {
  ok:['Syncing','متزامن','b-ok','check','ok'],
  delayed:['Sync delayed','المزامنة متأخرة','b-warn','clock','warn'],
  new:['Not synced yet','لم يتزامن بعد','b-unk','help','unk']
};

/* Richer investigation fields for the cinematic Investigation Room. */
Object.assign(INVESTIGATIONS['INV-418'], {
  detect:'00:15:02', ack:'00:06:34',
  hyp:[
    {t:['Queue backpressure after the worker concurrency drop','ضغط الطابور بعد خفض تزامن العمال'], c:72, d:['Timeouts follow the config change and the queue depth rise.','تتبع المهل تغيير الإعداد وارتفاع عمق الطابور.']},
    {t:['Branch network instability','عدم استقرار شبكة الفروع'], c:31, d:['Errors span 3 companies, which argues against a local network fault.','تمتد الأخطاء على 3 شركات مما يضعف احتمال عطل شبكة محلي.']},
    {t:['Regression in the retry logic','تراجع في منطق إعادة المحاولة'], c:24, d:['CI failed on the retry test, but production behavior is unverified.','فشل CI في اختبار إعادة المحاولة لكن سلوك الإنتاج غير مؤكد.']}
  ],
  evw:{E1:0.93, E2:0.90, E4:0.82, E3:0.74},
  own:{svc:'sync-service', team:['Platform','المنصة'], oncall:'#platform-oncall (demo)', esc:'#platform-leads (demo)', sched:['Business hours, Cairo','ساعات العمل، القاهرة'], rb:'runbooks/sync-failures (sample)'},
  changes:[
    {ago:151, t:['Config change: worker concurrency 8 → 2','تغيير إعداد: تزامن العمال 8 ← 2'], by:'deploy-bot (demo)'},
    {ago:420, t:['Deployment: sync-service v0.9.3','نشر: sync-service v0.9.3'], by:'ci-bot (demo)'},
    {ago:900, t:['Feature flag: offline batching on','علم ميزة: تفعيل الدفعات دون اتصال'], by:'release-team (demo)'}
  ],
  blast:[
    {d:0, t:['Retail Tower OS','Retail Tower OS'], lv:'high'},
    {d:1, t:['Sync Service','خدمة المزامنة'], lv:'high'},
    {d:2, t:['Message Queue','طابور الرسائل'], lv:'high'},
    {d:2, t:['Inventory updates','تحديثات المخزون'], lv:'med'},
    {d:2, t:['Reporting','التقارير'], lv:'med'},
    {d:1, t:['4 of 12 branches','4 من 12 فرعًا'], lv:'med', go:'network'},
    {d:1, t:['POS terminals','أجهزة نقاط البيع'], lv:'unk'}
  ],
  actions:[
    ['Raise workers 2 → 8 in staging and observe','رفع العمال من 2 إلى 8 في بيئة الاختبار ومراقبة النتيجة'],
    ['If timeouts persist, inspect the retry logic','إذا استمرت المهل فافحص منطق إعادة المحاولة'],
    ['Confirm POS terminal connectivity (not instrumented)','تأكد من اتصال أجهزة نقاط البيع (غير مزوَّدة بالقياس)']
  ],
  edges:[['pos','sync','obs',0,0.93],['sync','br','obs',0,0.88],['sync','inv','obs',0,0.90],['sync','rep','inf',0,0.60],['sync','q','obs',1,0.91],['q','db','inf',0,0.72]]
});
Object.assign(INVESTIGATIONS['INV-411'], {
  detect:'00:42:10', ack:'00:18:00',
  hyp:[{t:['A missing index on the sales table','فهرس مفقود في جدول المبيعات'], c:55, d:['Slow only for reports over 30 days.','بطيء فقط للتقارير لأكثر من 30 يومًا.']},
       {t:['Cache not warmed after deploy','الذاكرة المؤقتة غير مسخنة بعد النشر'], c:22, d:['Cache hit rate is unmeasured.','معدل إصابة الذاكرة غير مقاس.']}],
  evw:{E10:0.88}, own:{svc:'report-api', team:['Analytics','التحليلات'], oncall:'#analytics-oncall (demo)', esc:'#analytics-leads (demo)', sched:['Business hours, Cairo','ساعات العمل، القاهرة'], rb:'runbooks/slow-reports (sample)'},
  changes:[{ago:1560, t:['Query engine upgraded','ترقية محرك الاستعلام'], by:'ci-bot (demo)'}],
  blast:[{d:0, t:['Seshat-BI reports','تقارير Seshat-BI'], lv:'med'},{d:1, t:['Report API','واجهة التقارير'], lv:'med'},{d:1, t:['Data refresh','تحديث البيانات'], lv:'unk'}],
  actions:[['Read the query plan for the slowest report','قراءة خطة الاستعلام لأبطأ تقرير'],['Measure the cache hit rate','قياس معدل إصابة الذاكرة المؤقتة']],
  edges:[['api','qe','obs',1,0.86],['qe','wh','inf',0,0.55],['qe','ca','obs',0,0.80]]
});
Object.assign(INVESTIGATIONS['INV-402'], {
  detect:'—', ack:'—', hyp:[], evw:{}, own:{svc:'ingest-api', team:['Platform','المنصة'], oncall:'#platform-oncall (demo)', esc:'#platform-leads (demo)', sched:['Unknown','غير معروف'], rb:'(none found)'},
  changes:[], blast:[{d:0, t:['Khepri ingest','استقبال Khepri'], lv:'unk'}],
  actions:[['Restore the monitoring connection, then re-read','استعادة اتصال المراقبة ثم إعادة القراءة']]
});
