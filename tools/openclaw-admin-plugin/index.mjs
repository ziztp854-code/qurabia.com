import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const NAMES = ['qurabia_site_status', 'qurabia_question_stats', 'qurabia_propose_question_status'];
const emptySchema = { type: 'object', properties: {}, additionalProperties: false };
const proposalSchema = {
  type: 'object', additionalProperties: false, required: ['questionId', 'nextStatus', 'reason'],
  properties: { questionId: { type: 'string', minLength: 1, maxLength: 191 },
    nextStatus: { type: 'string', enum: ['DRAFT', 'ARCHIVED'] },
    reason: { type: 'string', minLength: 1, maxLength: 500 } },
};

function validateConfiguration(config) {
  if (!['https://qurabia.com', 'https://www.qurabia.com'].includes(config.origin) ||
      typeof config.token !== 'string' || config.token.length < 32 || config.token.length > 256 ||
      /[\r\n]/.test(config.token)) throw new Error('Qurabia connector configuration is invalid.');
}

function validateArgs(args, proposal) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid arguments.');
  const keys = proposal ? ['questionId', 'nextStatus', 'reason'] : [];
  if (Object.keys(args).some(key => !keys.includes(key))) throw new Error('Unknown argument.');
  if (proposal && (typeof args.questionId !== 'string' || !args.questionId.trim() || args.questionId.length > 191 ||
    !['DRAFT', 'ARCHIVED'].includes(args.nextStatus) || typeof args.reason !== 'string' ||
    !args.reason.trim() || args.reason.length > 500)) throw new Error('Invalid proposal.');
}

async function boundedJson(response) {
  if (Number(response.headers.get('content-length')) > 65536) {
    await response.body?.cancel(); throw new Error('Oversized response.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response.');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new Error('Oversized response.'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

export function createTools(context, config, fetcher = fetch) {
  if (context.agentId !== 'qurabia-admin') return [];
  validateConfiguration(config);
  return NAMES.map((name, index) => ({
    name, label: name,
    description: index === 2
      ? 'Propose a question status change. Does NOT execute it. The human OWNER must approve at /admin/openclaw. Publishing/deletion forbidden. Linked quiz questions are rejected.'
      : index === 0 ? 'Read bounded Qurabia site service health; no changes.' : 'Read aggregate question counts only; no personal data.',
    parameters: index === 2 ? proposalSchema : emptySchema,
    async execute(_callId, args) {
      validateArgs(args, index === 2);
      const tool = ['site_status', 'question_stats', 'propose_question_status'][index];
      const payload = { tool, args: index === 2 ? { ...args, requestId: randomUUID() } : {} };
      let response;
      try {
        response = await fetcher(`${config.origin}/api/integrations/openclaw`, {
          method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch { throw new Error('تعذّر الاتصال بخدمة قرابيا.'); }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`قرابيا رفضت الطلب (${response.status}). لم يتم تنفيذ تغيير.`);
      }
      const envelope = await boundedJson(response);
      if (envelope?.ok !== true || !envelope.data) throw new Error('Invalid response from Qurabia.');
      const data = index === 2 ? { ...envelope.data, approvalUrl: `${config.origin}/admin/openclaw` } : envelope.data;
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    },
  }));
}

export default {
  id: 'qurabia-admin', name: 'Qurabia restricted administration',
  register(api) {
    api.registerTool(context => {
      if (context.agentId !== 'qurabia-admin') return [];
      let secret;
      try { secret = JSON.parse(readFileSync(api.pluginConfig?.credentialsFile, 'utf8')); }
      catch { throw new Error('Qurabia service credential is not configured.'); }
      return createTools(context, { origin: 'https://qurabia.com', token: secret.token });
    }, { optional: true, names: NAMES });
  },
};
