import { planear, estadoDe } from './plan.mjs';

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

export function dailyPlan(db, userId, at = now()) {
  const preference = db.prepare('SELECT minutes_per_day,minutes_by_weekday_json FROM preferences WHERE user_id=?').get(userId);
  const weekday = new Date(at * 1000).getDay();
  let perDay;
  try { perDay = JSON.parse(String(preference?.minutes_by_weekday_json || 'null')); } catch { perDay = null; }
  const minutes = Math.max(0, Math.min(480, Number(Array.isArray(perDay) ? perDay[weekday] : preference?.minutes_per_day) || 0));
  const files = db.prepare(`SELECT f.id,f.filename,f.course_id,f.moodle_module_id,f.size,f.text_status,f.first_seen_at,
      c.name AS fullname,c.shortname AS slug,c.exam_at,a.summary,a.topics_json
    FROM files f JOIN courses c ON c.id=f.course_id
    LEFT JOIN analyses a ON a.file_id=f.id AND a.hash=f.hash
    WHERE f.user_id=? AND c.selected=1 ORDER BY f.first_seen_at`).all(userId);
  const log = db.prepare('SELECT studied_at,minutes, result AS resultado FROM study_log WHERE file_id=? AND user_id=? ORDER BY studied_at');
  const deadline = db.prepare('SELECT due_at FROM deadlines WHERE course_id=? AND due_at>? ORDER BY due_at LIMIT 1');
  const materials = files.map((file, index) => {
    let meta = {};
    try { meta = JSON.parse(String(file.topics_json || '{}')); } catch {}
    const nextDue = deadline.get(file.course_id, at)?.due_at;
    const due = [nextDue, file.exam_at].filter((value) => typeof value === 'number' && value > at).sort((a, b) => a - b)[0];
    const estimated = Math.min(120, Math.max(20, Math.round(Number(file.size || 0) / 20000) * 10 || 30));
    return {
      id: file.id, filename: file.filename, fullname: file.fullname, slug: file.slug,
      course_id: file.course_id, module_id: Number(file.moodle_module_id) || index,
      modulo: file.filename.replace(/\.pdf$/i, ''), category: /ficha|exerc|problema/i.test(file.filename) ? 'exercicios' : 'teoria',
      tipo: meta.tipo || (/ficha|exerc|problema/i.test(file.filename) ? 'ficha-exercicios' : 'apontamentos'),
      resumo: file.summary || null, topicos: meta.topicos || [], perguntas: meta.perguntas || [],
      minutos_estudo: Number(meta.minutos_estudo) || estimated,
      due_at: due || null,
      dias_ate_prazo: due ? Math.ceil((Number(due) - at) / DAY) : null,
      historico: log.all(file.id, userId).map((row) => ({ studied_at: Number(row.studied_at), minutes: Number(row.minutes), resultado: row.resultado })),
    };
  });
  const studiedToday = db.prepare('SELECT COALESCE(SUM(minutes),0) AS minutes FROM study_log WHERE user_id=? AND studied_at>=?')
    .get(userId, Math.floor(at / DAY) * DAY)?.minutes || 0;
  const work = new Map();
  for (const material of materials) {
    const remaining = Math.max(0, material.minutos_estudo - material.historico.reduce((sum, visit) => sum + visit.minutes, 0));
    if (!work.has(material.course_id)) work.set(material.course_id, { courseId: material.course_id,
      course: material.fullname, dueAt: material.due_at, remaining: 0 });
    work.get(material.course_id).remaining += remaining;
  }
  const availableToday = Math.max(0, minutes - Number(studiedToday));
  const pace = [...work.values()].reduce((sum, course) => {
    const daysLeft = course.dueAt ? Math.max(1, Math.ceil((Number(course.dueAt) - at) / DAY)) : 14;
    return sum + Math.ceil(course.remaining / daysLeft);
  }, 0);
  const targetToday = pace > 0 ? Math.min(availableToday, Math.max(20, pace)) : availableToday;
  const planned = targetToday >= 5 ? planear(materials, targetToday, at).sessao : [];
  const blocks = planned.map((material) => ({
    id: material.id, courseId: material.course_id, course: material.fullname,
    filename: material.filename, title: material.modulo, minutes: material.minutos_sugeridos,
    state: material.estado, summary: material.resumo, questions: material.perguntas,
    topics: material.topicos,
  }));
  const forecast = [];
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date((at + offset * DAY) * 1000);
    const capacity = Math.max(0, (Number(Array.isArray(perDay) ? perDay[day.getDay()] : preference?.minutes_per_day) || 0) -
      (offset === 0 ? Number(studiedToday) : 0));
    let available = capacity;
    const allocations = [];
    if (offset === 0) {
      for (const block of blocks) {
        let part = allocations.find((entry) => entry.courseId === block.courseId);
        if (!part) { part = { courseId: block.courseId, course: block.course, minutes: 0 }; allocations.push(part); }
        part.minutes += block.minutes;
        const course = work.get(block.courseId);
        if (course) course.remaining = Math.max(0, course.remaining - block.minutes);
        available -= block.minutes;
      }
    } else {
      const ordered = [...work.values()].sort((a, b) => Number(a.dueAt || Infinity) - Number(b.dueAt || Infinity));
      for (const course of ordered) {
        if (available <= 0 || course.remaining <= 0) continue;
        const daysLeft = course.dueAt ? Math.max(1, Math.ceil((Number(course.dueAt) - at - offset * DAY) / DAY)) : 14;
        const target = Math.max(20, Math.ceil(course.remaining / daysLeft));
        const allotted = Math.min(available, course.remaining, target);
        if (allotted > 0) { allocations.push({ courseId: course.courseId, course: course.course, minutes: allotted });
          course.remaining -= allotted; available -= allotted; }
      }
    }
    forecast.push({ date: day.toISOString().slice(0, 10), minutes: capacity - available, capacity, allocations });
  }
  return { minutes, studiedToday: Number(studiedToday), blocks, totalMaterials: materials.length,
    completed: materials.filter((material) => estadoDe(material, at).estado === 'em-dia').length, forecast };
}
