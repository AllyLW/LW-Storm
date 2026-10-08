import { createContext, useContext, useState, useEffect, useCallback } from "react";

// Tiny i18n: two languages (en, ar), a useT() hook, RTL handling. No deps.
// To add a string: add a key to both dictionaries and use t("key") in the UI.

const STRINGS = {
  en: {
    // header / nav
    "nav.plan": "Plan",
    "nav.board": "Board",
    "nav.map": "Map",
    "nav.roster": "Roster",
    "nav.history": "History",
    "nav.admin": "Admin",
    "brand.sub": "Storm events",
    "lock.pin": "R4 PIN",
    "lock.unlock": "Unlock",
    "lock.locked": "Lock",
    // common
    "common.search": "Search name",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.clearAll": "Clear all",
    "common.power": "Power",
    "common.member": "Member",
    "common.loading": "Loading…",
    "common.demo": "Demo mode — no database connected. PINs are",
    "common.demoReset": ". Data resets on reload.",
    // roster
    "roster.title": "Roster",
    "roster.sub": "{n} active · core = top {core} by power. Core players are marked and always get event priority.",
    "roster.bulkPaste": "Bulk paste THP",
    "roster.closePaste": "Close paste",
    "roster.pasteHelp": "One member per line: Name, THP. THP accepts 12.4M, 980K or raw numbers. Existing names update; new names are added.",
    "roster.applyPaste": "Apply paste",
    "roster.newName": "New member name",
    "roster.thp": "THP (e.g. 12.4M)",
    "roster.add": "Add",
    "roster.edit": "Edit",
    "roster.bench": "Bench",
    "roster.activate": "Activate",
    "roster.core": "CORE",
    // plan
    "plan.title": "Plan the week",
    "plan.sub": "Tick who voted available, then Generate teams to auto-fill (CSB first, then DSB). Or Start empty and place everyone by hand on the Board. You can always edit either afterward.",
    "plan.week": "Week",
    "plan.generate": "Generate teams",
    "plan.startEmpty": "Start empty",
    "plan.quickSet": "Quick set:",
    "plan.coreTo": "Core →",
    "plan.allCheck": "✓ all",
    "plan.officerOnly": "Entering availability and generating teams is for R4 officers. Unlock with your PIN in the top right.",
    "plan.viewNote": "Anyone can view the current teams on the Board and see fairness on History.",
    // board
    "board.noTeams": "No teams generated yet.",
    "board.goPlan": "Go to Plan, enter availability, and generate the week.",
    "board.draft": "Draft — tap ✎ on any name to swap or move. Confirm when it's final.",
    "board.confirmed": "Confirmed — locked so participation stays accurate. Reopen to make changes.",
    "board.clear": "Clear board",
    "board.saveEdits": "Save edits",
    "board.confirmWeek": "Confirm week",
    "board.reopenWeek": "Reopen week",
    "board.starters": "Starters",
    "board.subs": "Subs",
    "board.placed": "placed",
    "board.addPlayer": "+ Add player",
    "board.close": "Close",
    "board.swapIn": "Swap in",
    "board.move": "Move",
    "board.removeTeam": "Remove from team",
    "board.csb": "Canyon Storm — Thursday",
    "board.dsb": "Desert Storm — Friday",
    // map
    "map.title": "Battle map",
    "map.sub": "Click a building to assign players from Team {team}. Up to {max} each.",
    "map.noWeek": "No week generated yet.",
    "map.saveMap": "Save map",
    "map.download": "Download Team {team}:",
    "map.guardian": "+ guardian",
    "map.guardianTitle": "Guardian",
    "map.covers": "Covers:",
    "map.removeGuardian": "Remove guardian",
    "map.clearBuilding": "Clear building",
    "map.assign": "+ assign",
    "map.teamSummary": "Team {team} — {label}",
    // history
    "history.title": "History & fairness",
    "history.sub": "Fairness runs on the last {n} weeks (the window the generator uses). All-time is shown alongside. Fewest recent plays sit at the top — those are next in line.",
    "history.recent": "Recent",
    "history.allTime": "All-time",
    "history.lastPlayed": "Last played",
    "history.never": "never",
    "history.confirmedWeeks": "Confirmed weeks",
    "history.noWeeks": "No confirmed weeks yet.",
    "history.placements": "placements · confirmed",
    "history.delete": "Delete",
    // admin
    "admin.title": "Admin",
    "admin.sub": "These change how the generator behaves for everyone.",
    "admin.pinRequired": "Admin PIN required.",
    "admin.alliance": "Alliance name",
    "admin.coreSize": "Core size (top N by power play both events)",
    "admin.window": "Fairness window (weeks)",
    "admin.save": "Save settings",
    "foot.holdLine": "— hold the line —",
  },
  ar: {
    "nav.plan": "التخطيط",
    "nav.board": "اللوحة",
    "nav.map": "الخريطة",
    "nav.roster": "القائمة",
    "nav.history": "السجل",
    "nav.admin": "الإدارة",
    "brand.sub": "أحداث العاصفة",
    "lock.pin": "رمز R4",
    "lock.unlock": "فتح",
    "lock.locked": "قفل",
    "common.search": "ابحث عن اسم",
    "common.save": "حفظ",
    "common.cancel": "إلغاء",
    "common.clearAll": "مسح الكل",
    "common.power": "القوة",
    "common.member": "العضو",
    "common.loading": "جارٍ التحميل…",
    "common.demo": "وضع تجريبي — لا توجد قاعدة بيانات متصلة. الرموز هي",
    "common.demoReset": ". تُعاد البيانات عند إعادة التحميل.",
    "roster.title": "القائمة",
    "roster.sub": "{n} نشط · النواة = أقوى {core} حسب القوة. يُعلَّم أعضاء النواة ولهم الأولوية دائمًا.",
    "roster.bulkPaste": "لصق جماعي للقوة",
    "roster.closePaste": "إغلاق اللصق",
    "roster.pasteHelp": "عضو واحد في كل سطر: الاسم، القوة. تقبل 12.4M أو 980K أو أرقامًا خام. الأسماء الموجودة تُحدَّث؛ الجديدة تُضاف.",
    "roster.applyPaste": "تطبيق اللصق",
    "roster.newName": "اسم عضو جديد",
    "roster.thp": "القوة (مثال 12.4M)",
    "roster.add": "إضافة",
    "roster.edit": "تعديل",
    "roster.bench": "احتياط",
    "roster.activate": "تفعيل",
    "roster.core": "نواة",
    "plan.title": "خطّط للأسبوع",
    "plan.sub": "حدّد من صوّت بالتوفر، ثم «إنشاء الفرق» للملء التلقائي (CSB أولًا ثم DSB). أو «ابدأ فارغًا» وضع الجميع يدويًا في اللوحة. يمكنك التعديل لاحقًا دائمًا.",
    "plan.week": "الأسبوع",
    "plan.generate": "إنشاء الفرق",
    "plan.startEmpty": "ابدأ فارغًا",
    "plan.quickSet": "ضبط سريع:",
    "plan.coreTo": "النواة ←",
    "plan.allCheck": "✓ الكل",
    "plan.officerOnly": "إدخال التوفر وإنشاء الفرق مخصص لضباط R4. افتح برمزك في الأعلى يمينًا.",
    "plan.viewNote": "يمكن للجميع رؤية الفرق الحالية في اللوحة ورؤية العدالة في السجل.",
    "board.noTeams": "لم تُنشأ أي فرق بعد.",
    "board.goPlan": "اذهب إلى التخطيط، أدخل التوفر، وأنشئ الأسبوع.",
    "board.draft": "مسودة — انقر ✎ على أي اسم للتبديل أو النقل. أكّد عند الانتهاء.",
    "board.confirmed": "مؤكَّد — مقفل للحفاظ على دقة المشاركة. أعد الفتح للتعديل.",
    "board.clear": "مسح اللوحة",
    "board.saveEdits": "حفظ التعديلات",
    "board.confirmWeek": "تأكيد الأسبوع",
    "board.reopenWeek": "إعادة فتح الأسبوع",
    "board.starters": "الأساسيون",
    "board.subs": "الاحتياط",
    "board.placed": "مُعيَّن",
    "board.addPlayer": "+ إضافة لاعب",
    "board.close": "إغلاق",
    "board.swapIn": "استبدال",
    "board.move": "نقل",
    "board.removeTeam": "إزالة من الفريق",
    "board.csb": "عاصفة الوادي — الخميس",
    "board.dsb": "عاصفة الصحراء — الجمعة",
    "map.title": "خريطة المعركة",
    "map.sub": "انقر على مبنى لتعيين لاعبين من الفريق {team}. حتى {max} لكل مبنى.",
    "map.noWeek": "لم يُنشأ أي أسبوع بعد.",
    "map.saveMap": "حفظ الخريطة",
    "map.download": "تنزيل الفريق {team}:",
    "map.guardian": "+ حارس",
    "map.guardianTitle": "حارس",
    "map.covers": "يغطي:",
    "map.removeGuardian": "إزالة الحارس",
    "map.clearBuilding": "مسح المبنى",
    "map.assign": "+ تعيين",
    "map.teamSummary": "الفريق {team} — {label}",
    "history.title": "السجل والعدالة",
    "history.sub": "تعمل العدالة على آخر {n} أسابيع (النافذة التي يستخدمها المُنشئ). يظهر الإجمالي بجانبها. الأقل لعبًا مؤخرًا في الأعلى — هم التاليون في الدور.",
    "history.recent": "مؤخرًا",
    "history.allTime": "الإجمالي",
    "history.lastPlayed": "آخر لعب",
    "history.never": "أبدًا",
    "history.confirmedWeeks": "الأسابيع المؤكدة",
    "history.noWeeks": "لا توجد أسابيع مؤكدة بعد.",
    "history.placements": "تعيينات · أُكِّد",
    "history.delete": "حذف",
    "admin.title": "الإدارة",
    "admin.sub": "هذه تغيّر كيفية عمل المُنشئ للجميع.",
    "admin.pinRequired": "يلزم رمز الإدارة.",
    "admin.alliance": "اسم التحالف",
    "admin.coreSize": "حجم النواة (أقوى N يلعبون الحدثين)",
    "admin.window": "نافذة العدالة (أسابيع)",
    "admin.save": "حفظ الإعدادات",
    "foot.holdLine": "— اثبتوا على الخط —",
  },
};

const I18nCtx = createContext(null);
export const useT = () => useContext(I18nCtx);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("lang") || "en"; } catch { return "en"; }
  });

  useEffect(() => {
    const rtl = lang === "ar";
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    try { localStorage.setItem("lang", lang); } catch { /* ignore */ }
  }, [lang]);

  // t("key", { n: 5 }) — simple {placeholder} interpolation.
  const t = useCallback((key, vars) => {
    let s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
    return s;
  }, [lang]);

  return (
    <I18nCtx.Provider value={{ lang, setLang, t, rtl: lang === "ar" }}>
      {children}
    </I18nCtx.Provider>
  );
}
