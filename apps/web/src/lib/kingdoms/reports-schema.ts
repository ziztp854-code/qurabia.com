import { z } from 'zod';
import { worldIdSchema } from './api-schema';
import { reportCategories, type ReportCategory, type PublicKingdomReport } from './report-events';
export const reportIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const reportsQuerySchema = z
  .object({
    worldId: worldIdSchema,
    category: z.enum(['all', ...reportCategories]).default('all'),
    unread: z.enum(['all', 'unread', 'read']).default('all'),
    q: z.string().trim().max(120).default(''),
    order: z.enum(['newest', 'oldest']).default('newest'),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    cursor: z.string().max(400).optional(),
  })
  .strict();
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
export const readReportSchema = z
  .object({ worldId: worldIdSchema, reportId: reportIdSchema })
  .strict();
export const reportCursorSchema = z
  .object({
    at: z.number().int().min(0).max(8e12),
    ordinal: z.number().int().min(0).max(2147483647),
    id: reportIdSchema,
  })
  .strict();
export type RoyalReportSummary = {
  id: string;
  at: number;
  ordinal: number;
  category: ReportCategory;
  eventKey: string;
  title: string;
  preview: string;
  readAt: number | null;
};
export type RoyalReportDetail = PublicKingdomReport & { readAt: number | null };
export type RoyalReportsPage = {
  items: RoyalReportSummary[];
  nextCursor: string | null;
  unreadCount: number;
  total: number;
  categories: Record<ReportCategory, number>;
};
