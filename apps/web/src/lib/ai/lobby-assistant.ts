import { xai } from '@ai-sdk/xai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

/**
 * Tahaddi lobby assistant. A short chat responder that the player
 * can summon in the game lobby to ask about Tahaddi/Qurabia rules,
 * features, or navigation. Replies are short, formal Arabic, and
 * never promise account-level actions or reveal private data.
 *
 * Safety: every reply is structured, screened for prompt
 * injection, and may only reference content that is part of the
 * official help corpus passed to the model.
 */

export const LOBBY_ASSISTANT_MAX_HISTORY = 6;
export const LOBBY_ASSISTANT_MAX_MESSAGE = 240;
const LOBBY_ASSISTANT_MAX_TOKENS = 220;

/**
 * Hard kill-switch for the Grok bot. When XAI_DISABLED=true the AI
 * routes short-circuit and never reach xAI even if XAI_API_KEY is
 * configured. Set this in Vercel → Project Settings → Environment
 * Variables to keep the assistant offline without rotating the key.
 */
function isAiDisabled(): boolean {
  return process.env.XAI_DISABLED === 'true';
}

export const lobbyAssistantInputSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(LOBBY_ASSISTANT_MAX_MESSAGE),
          })
          .strict(),
      )
      .min(1, 'اكتب رسالة واحدة على الأقل.')
      .max(LOBBY_ASSISTANT_MAX_HISTORY + 1, 'تجاوزت طول المحادثة المسموح.'),
    topic: z
      .string()
      .trim()
      .min(2, 'اذكر الموضوع الذي تريد مساعدة فيه.')
      .max(60, 'اختصر الموضوع إلى 60 حرفًا.'),
  })
  .strict();

const lobbyAssistantResponseSchema = z
  .object({
    reply: z.string().trim().min(4).max(LOBBY_ASSISTANT_MAX_MESSAGE),
    suggestions: z
      .array(
        z.object({
          label: z.string().trim().min(2).max(40),
          route: z.string().trim().min(1).max(80),
        }),
      )
      .max(3),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reply.length > LOBBY_ASSISTANT_MAX_TOKENS * 2) {
      context.addIssue({
        code: 'custom',
        path: ['reply'],
        message: 'الرد طويل جدًا.',
      });
    }
  });

export type LobbyAssistantInput = z.input<typeof lobbyAssistantInputSchema>;
export type LobbyAssistantResponse = z.infer<typeof lobbyAssistantResponseSchema>;

export class LobbyAssistantError extends Error {
  constructor(
    message: string,
    readonly code: 'CONFIG' | 'UPSTREAM' | 'INVALID_RESPONSE' | 'POLICY',
  ) {
    super(message);
    this.name = 'LobbyAssistantError';
  }
}

const unsafeGeneratedText =
  /https?:\/\/|www\.|تجاهل (?:كل )?التعليمات|تعليمات النظام|ignore previous instructions|system prompt/i;

function containsUnsafeGeneratedText(value: unknown): boolean {
  if (typeof value === 'string') return unsafeGeneratedText.test(value);
  if (Array.isArray(value)) return value.some(containsUnsafeGeneratedText);
  if (value && typeof value === 'object') {
    return Object.values(value).some(containsUnsafeGeneratedText);
  }
  return false;
}

const ALLOWED_TOPIC_HINT =
  'يمكنك الإجابة فقط عن: قوانين البلوت السعودي، ألعاب تحدّي (من سيربح المليون، برج المعرفة، تحدّي الحروف، لعبة الدخيل، العالم الموازي، الزمن المقلوب)، إنشاء حساب، استعادة كلمة المرور، إدارة الغرف، الدبل، الأشكل، الحكم الثاني.';

const PROHIBITED_TOPIC_HINT =
  'ممنوع: مشاركة كلمات المرور، تنفيذ عمليات حسابية، توليد أسئلة غير أخلاقية، التحدث بلسان منصة أخرى، إضافة روابط خارجية.';

function buildSystemPrompt(input: z.infer<typeof lobbyAssistantInputSchema>) {
  return [
    'أنت مساعد اللوبي الرسمي لمنصة تحدّي (qurabia.com) بالعربية الفصحى.',
    'ردودك مختصرة ومهنية ولا تتجاوز 220 رمزًا ولا تقترح روابط خارجية.',
    `الموضوع المطروح: ${JSON.stringify(input.topic)}.`,
    ALLOWED_TOPIC_HINT,
    PROHIBITED_TOPIC_HINT,
  ].join('\n');
}

function isPolicyViolation(reply: string): boolean {
  // Reject any reply that explicitly tries to break out of the
  // assistant persona or references prohibited actions.
  return /(?:api[_-]?key|password|كلمة المرور|تجاهل التعليمات|system prompt|رمز الدخول)/i.test(
    reply,
  );
}

function buildPromptMessages(
  system: string,
  history: z.infer<typeof lobbyAssistantInputSchema>['messages'],
) {
  return [
    { role: 'system' as const, content: system },
    ...history.map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
  ];
}

function normalizeGatewayModel(model: string, provider: string) {
  return model.includes('/') ? model : `${provider}/${model}`;
}

async function generateWithGateway(
  input: z.infer<typeof lobbyAssistantInputSchema>,
  model: string,
) {
  const result = await generateText({
    model,
    output: Output.object({ schema: lobbyAssistantResponseSchema }),
    system: buildSystemPrompt(input),
    prompt: buildPromptMessages(buildSystemPrompt(input), input.messages),
    abortSignal: AbortSignal.timeout(20_000),
  });
  return validateResponse(lobbyAssistantResponseSchema.parse(result.output));
}

async function generateWithXai(input: z.infer<typeof lobbyAssistantInputSchema>) {
  const system = buildSystemPrompt(input);
  const result = await generateText({
    model: xai.responses(process.env.XAI_MODEL || 'grok-4.5'),
    output: Output.object({ schema: lobbyAssistantResponseSchema }),
    system,
    prompt: buildPromptMessages(system, input.messages),
    providerOptions: { xai: { reasoningEffort: 'low', store: false } },
    abortSignal: AbortSignal.timeout(20_000),
  });
  return validateResponse(lobbyAssistantResponseSchema.parse(result.output));
}

function validateResponse(response: LobbyAssistantResponse): LobbyAssistantResponse {
  if (containsUnsafeGeneratedText(response)) {
    throw new LobbyAssistantError('المساعد أعاد محتوى غير آمن.', 'POLICY');
  }
  if (isPolicyViolation(response.reply)) {
    throw new LobbyAssistantError('الرد يخالف سياسات المنصة.', 'POLICY');
  }
  return response;
}

export async function askLobbyAssistant(
  rawInput: LobbyAssistantInput,
): Promise<LobbyAssistantResponse> {
  const input = lobbyAssistantInputSchema.parse(rawInput);

  if (isAiDisabled()) {
    throw new LobbyAssistantError('تم تعطيل مساعد اللوبي مؤقتًا.', 'CONFIG');
  }

  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL || process.env.GEMINI_API_KEY) {
    try {
      return await generateWithGateway(
        input,
        normalizeGatewayModel(
          process.env.AI_QUESTIONS_MODEL ||
            process.env.AI_GATEWAY_MODEL ||
            process.env.GEMINI_MODEL ||
            'google/gemini-3.6-flash',
          'google',
        ),
      );
    } catch (error) {
      if (!(error instanceof LobbyAssistantError)) {
        if (!process.env.XAI_API_KEY) {
          throw new LobbyAssistantError('خدمة المساعد غير متاحة الآن.', 'UPSTREAM');
        }
        console.warn('[Lobby] Gateway failed; retrying with xAI fallback.');
      } else {
        throw error;
      }
    }
  }
  if (process.env.XAI_API_KEY) {
    return generateWithXai(input);
  }

  throw new LobbyAssistantError('خدمة المساعد غير مهيأة بعد.', 'CONFIG');
}
