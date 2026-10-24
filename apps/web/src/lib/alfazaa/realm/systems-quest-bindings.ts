import type { GameplayContext } from './common';
import { getBuilding } from '../domain/catalog';
import { armRow, researchRow, systemsCatalog, type QuestRow } from './systems-catalog';
import type { SystemsState } from './systems-types';
interface Binding {
  progress: number;
  key: string;
  adaptation: string | null;
  supported: boolean;
  goal?: number;
}
const independent = 'ربط مستقل موثّق؛ حسم الخادم الأصلي غير متاح.';
export function questBinding(
  row: QuestRow,
  state: SystemsState,
  context: GameplayContext,
): Binding {
  const counters = row.family === 'daily' ? state.daily : state.lifetime;
  const event = (key: string, adaptation: string | null = null): Binding => ({
    progress: counters[key] ?? 0,
    key,
    adaptation,
    supported: true,
  });
  const value = (progress: number, key: string, adaptation: string | null = null): Binding => ({
    progress,
    key,
    adaptation,
    supported: true,
  });
  const building = () => {
    if (row.target >= 110001 && row.target <= 110100)
      return value(context.view.castleLevel >= row.target - 110000 ? 1 : 0, 'castle-level');
    const target = getBuilding(row.target);
    return value(
      context.view.cells.filter((c) => {
        const own = c?.kind === 'building' ? getBuilding(c.cfgId) : undefined;
        return !!own && !!target && own.type === target.type && own.level >= target.level;
      }).length,
      'owned-building',
    );
  };
  const unit = (minimum = false) => {
    const target = armRow(row.target);
    if (!target) return value(0, 'unknown-unit');
    const matches = (id: number) => {
      const a = armRow(id);
      return (
        a?.subtype === target.subtype &&
        a?.type === target.type &&
        (!minimum || a.level >= target.level)
      );
    };
    return value(
      context.view.cells.filter((c) => c?.kind === 'troop' && matches(c.cfgId)).length +
        Object.entries(state.reserve).reduce((sum, [id, n]) => sum + (matches(+id) ? n : 0), 0),
      'owned-troop',
    );
  };
  const research = (type: number) =>
    value(
      Math.max(
        0,
        ...Object.entries(state.research).map(([key, id]) => {
          const r = researchRow(key.startsWith('science:') ? 'science' : 'college', id);
          return r?.type === type ? r.level : 0;
        }),
      ),
      'research-level',
    );
  const maxHero = (kind: 'level' | 'stars' | 'skills') =>
    value(
      Math.max(
        0,
        ...context.view.heroes.map((h) =>
          kind === 'skills' ? Math.max(0, ...(h.skillLevels ?? [])) : h[kind],
        ),
      ),
      'hero-' + kind,
      row.target === 17
        ? 'هوية البطل القديمة 17 غير موجودة في جدول الأبطال الحالي؛ يقبل أي بطل مملوك.'
        : null,
    );
  const companionLevel = () =>
    value(Math.max(0, ...Object.values(state.beasts)), 'companion-level');
  const campaign = () =>
    value(
      context.view.campaignCompleted.some((id) => id >= row.target) ? row.goal : 0,
      'campaign-stage',
    );
  if (row.chapterReward) return value(0, 'chapter-claims');
  if (row.family === 'main')
    switch (row.type) {
      case 2:
        return event(`recruit:${row.target}`);
      case 3:
        return event('worldmonster-win');
      case 4:
        return event('resource-gather:400001');
      case 5:
        return event('resource-gather:430001');
      case 6:
        return event('resource-gather:450001');
      case 8:
      case 38:
        return event(`merge:${row.target}`);
      case 9:
        return building();
      case 10:
        return unit();
      case 11: {
        const target = researchRow('college', row.target);
        const own = target
          ? researchRow('college', state.research[`college:${target.type}`] ?? 0)
          : undefined;
        return value(target && own && own.level >= target.level ? 1 : 0, 'research-source-row');
      }
      case 15:
        return event(`worldmonster-win:atleast:${row.target}`);
      case 32:
        return event('rescue-win');
      case 33:
        return event('ruins-win');
      case 36:
        return event('trial-win');
      case 37:
        return event(
          'tower-win',
          'الأراضي المأسورة في الخادم الأصلي تقابل انتصارات الأبراج المستقلة.',
        );
      case 39:
        return event('hero-recruit', 'التجنيد المتقدم يقبل أي بطل جديد في التنفيذ المستقل.');
      case 40:
        return campaign();
    }
  if (row.family === 'road')
    switch (row.type) {
      case 1:
        return building();
      case 3:
        return event('recruit-infantry');
      case 9: {
        const target = armRow(row.target),
          minimum = row.goal;
        const matches = (id: number) => {
          const own = armRow(id);
          return (
            !!own &&
            own.subtype === target?.subtype &&
            own.type === target.type &&
            own.level >= minimum
          );
        };
        return {
          ...value(
            context.view.cells.filter((c) => c?.kind === 'troop' && matches(c.cfgId)).length +
              Object.entries(state.reserve).reduce(
                (sum, [id, n]) => sum + (matches(+id) ? n : 0),
                0,
              ),
            'owned-troop',
            'يُفسّر عدد القوات ومستواها من وصف المصدر: تسع وحدات مشاة من مستوى20 أو أعلى.',
          ),
          goal: target?.level ?? 1,
        };
      }
      case 14:
        return event(
          'guild-boss',
          'شارك في هزيمة زعيم التحالف واستلم جائزة المساهمة؛ بديل هدف الطائر المجنح الأصلي.',
        );
      case 18:
        return event('guild-help');
      case 38:
        return research(row.target);
      case 41:
        return event(`expedition-stage:${row.target}`);
      case 47:
        return event('guild-donate');
      case 50:
        return event('beast-feed');
      case 51:
      case 52:
        return event(
          'craft',
          'استُبدلت صناعة القوالب والمواهب القديمة بصناعة عناصر من وصفات الحقيبة.',
        );
      case 53:
        return maxHero('level');
      case 54:
        return {
          ...value(
            context.view.heroes.some((h) => h.skills.length > 1) ? 1 : 0,
            'hero-skill-learn',
            'معرّف المهارة القديم غير موجود؛ يلزم تعلم مهارة إضافية لأي بطل مملوك، ولا تُحتسب المهارة الفطرية.',
          ),
          goal: 1,
        };
      case 55:
        return maxHero('stars');
      case 56:
        return value(
          new Set(
            state.equippedRelics.map((id) => systemsCatalog.relics.find((r) => r.id === id)?.slot),
          ).size >= 4
            ? row.goal
            : 0,
          'relic-slots',
          'جدول الآثار الحالي يحتوي أربع خانات؛ يلزم تجهيز الخانات الأربع.',
        );
      case 57:
        return companionLevel();
      case 58:
        return event('arena-attempt');
    }
  if (row.family === 'plot')
    switch (row.type) {
      case 1:
        return building();
      case 6:
        return maxHero('level');
      case 12:
        return event('tower-win', 'أسر أراضي المدينة يقابل انتصارات الأبراج المستقلة.');
      case 14:
        return event(
          'guild-boss',
          'شارك في هزيمة زعيم التحالف واستلم جائزة المساهمة؛ بديل هدف الطائر المجنح الأصلي.',
        );
      case 16:
        return event('recruit');
      case 18:
        return event('guild-help');
      case 19:
        return event('hero-recruit');
      case 32:
        return event('collect');
      case 36:
        return event('worldmonster-win');
      case 38:
        return research(row.target);
      case 40:
        return event('shop-buy');
      case 41:
        return event(`expedition-stage:${row.target}`);
      case 47:
        return event('guild-donate');
      case 50:
        return event('beast-feed');
      case 58:
        return event('arena-attempt');
      case 59:
        return event('mining-capture');
      case 61:
        return event('war-training');
      case 62:
        return event('dungeon-win');
      case 63:
        return value(
          context.view.heroes.filter((h) => h.equipment && h.equipment.level >= row.target).length,
          'equipped-accessory-level',
        );
      case 64:
        return event('stamina-buy');
      case 65:
        return value(
          context.view.heroes.filter((h) => (h.rarity ?? 0) >= 5 && h.stars >= row.target).length,
          'legendary-hero-stars',
          'الأبطال الأسطوريون هم جودة5 في الجدول الحالي؛ يقاس الحد بالنجوم الفعلية.',
        );
      case 66:
        return maxHero('skills');
      case 69:
        return event('trial-win');
      case 70:
        return event('guild-donate', 'استُبدل تبرع تحدي التحالف بالتبرع الفعلي لخزينة التحالف.');
      case 71:
        return event('guild-help', 'استُبدل الانضمام لتحدي التحالف بمساعدة بناء أعضاء التحالف.');
      case 72:
        return value(Object.values(state.beasts).filter((n) => n > 0).length, 'owned-companions');
      case 73:
        return event(
          'guild-gift-claim',
          'اجمع هدايا مساهمتك الفعلية في هزيمة زعيم التحالف؛ بديل هدايا المساعدة الأصلية.',
        );
      case 74:
        return value(
          Math.max(
            0,
            ...[126, 129, 130].map(
              (type) => researchRow('college', state.research[`college:${type}`] ?? 0)?.level ?? 0,
            ),
          ),
          'anti-troop-research',
        );
    }
  if (row.family === 'daily')
    switch (row.type) {
      case 1:
        return event(`build:${row.target}`);
      case 2:
        return event('recruit-infantry');
      case 3:
        return event('worldmonster-win');
      case 5:
        return event('resource-gather:430001');
      case 6:
        return event('resource-gather:450001');
      case 11:
        return event('collect');
      case 30:
        return {
          ...event(
            'guild-boss',
            'اهزم زعيم التحالف واستلم جائزة المساهمة مرة واحدة؛ زعيم الفزعة يتجدد يوميًا.',
          ),
          goal: 1,
        };
      case 31:
        return event('guild-donate');
      case 36:
        return event(
          'guild-help',
          'مهمة مستقلة: مساعدة بناء أعضاء التحالف، بديل شرط هدايا الصوت الأصلي.',
        );
      case 37:
        return {
          ...event(
            'expedition-win',
            'مهمة مستقلة: انتصارات الاستكشاف، بديل مدة الغرفة الصوتية الأصلية.',
          ),
          goal: 3,
        };
      case 38:
        return {
          ...event('trial-win', 'مهمة مستقلة: انتصارات محطة الرايات، بديل مدة الميكروفون الأصلية.'),
          goal: 3,
        };
      case 41:
        return event('stamina-consume');
      case 42:
        return event('stamina-buy');
      case 43:
        return event('shop-buy');
      case 44:
        return event('speedup-use');
      case 45:
        return event('trial-win');
      case 46:
        return event('battlefield-attempt');
      case 47:
        return event('hero-recruit');
      case 48:
        return event('expedition-attempt');
      case 49:
        return event('hero-xp-item');
      case 50:
        return event(
          'guild-gift-claim',
          'استلم هدية مساهمتك في هزيمة زعيم التحالف؛ بديل مساعدة صندوق الذهب الأصلي.',
        );
    }
  if (row.family === 'milestone')
    switch (row.type) {
      case 1:
        return building();
      case 2:
        return event('worldmonster-win');
      case 8:
        return value(
          context.view.world?.allianceMember || (state.lifetime['guild-join'] ?? 0) > 0 ? 1 : 0,
          'alliance-member',
        );
      case 14:
        return event(
          'guild-boss',
          'شارك في هزيمة زعيم التحالف واستلم جائزة المساهمة؛ بديل هدف الطائر المجنح الأصلي.',
        );
      case 15:
        return event(
          'gather-attempt',
          'أرسل حملات جمع فعلية في العالم المشترك؛ يحتسب الإرسال المقبول بدلًا من نتيجة الجمع الأصلية.',
        );
      case 69:
        return event('trial-win');
      case 75:
        return event(`merge:atleast:${row.target}`);
      case 76:
        return event('tower-win', independent);
      case 28:
        return value(
          context.view.cells.reduce(
            (sum, c) => sum + (c?.kind === 'troop' ? (armRow(c.cfgId)?.level ?? 0) * 1000 : 0),
            0,
          ) + context.view.heroes.reduce((sum, h) => sum + h.level * 1000 + h.stars * 5000, 0),
          'independent-power',
          'القوة المستقلة = مجموع مستويات قوات المدينة×1000 + مستويات الأبطال×1000 + نجومهم×5000؛ لا تدعي معادلة الخادم الأصلي.',
        );
    }
  return {
    progress: 0,
    key: `unavailable:${row.family}:${row.type}`,
    adaptation: 'لا يوجد نظام مستقل موثوق يحقق هذا الشرط حتى الآن؛ لا تُمنح المكافأة تلقائيًا.',
    supported: false,
  };
}
