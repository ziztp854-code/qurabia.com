import { z } from 'zod';
import {
  hashInstallationSecret,
  installationIdSchema,
  installationSecretSchema,
  registrationRevisionSchema,
} from './installation-capability';

const optionalMetadata = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value || null);

export const expoPushTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{20,200}\]$/);

export const mobilePushDeviceSchema = z
  .object({
    expoPushToken: expoPushTokenSchema,
    sessionId: z.string().min(1).max(128),
    platform: z.enum(['ios', 'android']),
    deviceName: optionalMetadata(120),
    deviceModel: optionalMetadata(120),
    osVersion: optionalMetadata(64),
    appVersion: optionalMetadata(32),
    installationId: installationIdSchema,
    installationSecret: installationSecretSchema,
    registrationRevision: registrationRevisionSchema,
    previousRegistrationRevision: registrationRevisionSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    previousExpoPushToken: expoPushTokenSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  })
  .strict();

export const mobilePushDeviceRemovalSchema = z
  .object({
    expoPushToken: expoPushTokenSchema,
    installationId: installationIdSchema.optional(),
    installationSecret: installationSecretSchema.optional(),
    registrationRevision: registrationRevisionSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const count = [
      value.installationId,
      value.installationSecret,
      value.registrationRevision,
    ].filter((item) => item !== undefined).length;
    if (count !== 0 && count !== 3) {
      context.addIssue({ code: 'custom', message: 'Complete installation capability is required.' });
    }
  });

export type MobilePushDeviceInput = z.infer<typeof mobilePushDeviceSchema>;

export type MobilePushDeviceRepository = {
  upsert(
    input: Omit<
      MobilePushDeviceInput,
      'previousExpoPushToken' | 'previousRegistrationRevision' | 'installationSecret'
    > & {
      userId: string;
      installationSecretHash: string;
    },
    previousExpoPushToken: string | null,
    previousRegistrationRevision: string | null,
  ): Promise<{ id: string; registrationRevision: string }>;
  disable(
    userId: string,
    input:
      | { expoPushToken: string }
      | {
          expoPushToken: string;
          installationId: string;
          installationSecretHash: string;
          registrationRevision: string;
        },
  ): Promise<boolean>;
};

export async function registerMobilePushDevice(
  repository: MobilePushDeviceRepository,
  userId: string,
  input: MobilePushDeviceInput,
) {
  const parsed = mobilePushDeviceSchema.parse(input);
  const {
    previousExpoPushToken,
    previousRegistrationRevision,
    installationSecret,
    ...registration
  } = parsed;
  return repository.upsert(
    {
      userId,
      ...registration,
      installationSecretHash: hashInstallationSecret(installationSecret),
    },
    previousExpoPushToken,
    previousRegistrationRevision,
  );
}

export function unregisterMobilePushDevice(
  repository: MobilePushDeviceRepository,
  userId: string,
  input: z.infer<typeof mobilePushDeviceRemovalSchema>,
) {
  const parsed = mobilePushDeviceRemovalSchema.parse(input);
  return repository.disable(
    userId,
    parsed.installationId
      ? {
          expoPushToken: parsed.expoPushToken,
          installationId: parsed.installationId,
          installationSecretHash: hashInstallationSecret(parsed.installationSecret!),
          registrationRevision: parsed.registrationRevision!,
        }
      : { expoPushToken: parsed.expoPushToken },
  );
}
