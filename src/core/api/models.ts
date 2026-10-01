import { z } from 'zod';

export const healthSchema = z
  .object({
    status: z.literal('ok'),
    service: z.string().min(1),
  })
  .strict();

export const errorSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const loginSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        accessToken: z.string().min(1),
        expiresIn: z.number().int().positive(),
        tokenType: z.literal('Bearer'),
        user: z
          .object({
            email: z.string().email(),
            role: z.string().min(1),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .strict();

export const dtrSchema = z
  .object({
    id: z.string().min(1),
    code: z.string().min(1),
    name: z.string().min(1),
    circle: z.string().min(1),
    locality: z.string().min(1),
    status: z.enum(['online', 'offline', 'warning']),
    load: z
      .object({
        value: z.number(),
        unit: z.string().min(1),
        recordedAt: z.string().datetime(),
      })
      .strict(),
  })
  .strict();

export const dtrListSchema = z
  .object({
    items: z.array(dtrSchema).min(1),
  })
  .strict();

export const chartPointSchema = z
  .object({
    x: z.string().min(1),
    y: z.number(),
  })
  .strict();

export const chartSeriesSchema = z
  .object({
    name: z.string().min(1),
    points: z.array(chartPointSchema).min(1),
  })
  .strict();

export const metricsSchema = z
  .object({
    metric: z.enum(['communication', 'energy-loss']),
    title: z.string().min(1),
    unit: z.string().min(1),
    series: z.array(chartSeriesSchema).min(1),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthSchema>;
export type ErrorResponse = z.infer<typeof errorSchema>;
export type LoginResponse = z.infer<typeof loginSchema>;
export type Dtr = z.infer<typeof dtrSchema>;
export type DtrList = z.infer<typeof dtrListSchema>;
export type ChartPointModel = z.infer<typeof chartPointSchema>;
export type ChartSeriesModel = z.infer<typeof chartSeriesSchema>;
export type Metrics = z.infer<typeof metricsSchema>;

const countSliceSchema = z.object({
  count: z.number().nonnegative(),
  percentage : z.string(),
  label:z.string().min(1),
}).passthrough();

const trendSliceSchema = countSliceSchema.extend({
  trends: z.array(z.number()),
});
export const consumerMetricsSchema = z.object({
  success: z.literal(true),
  data: z.object({
    timestamp: z.string().min(1),
    connectionStatus: z.object({
      totalMeterCount:z.number().nonnegative(),
      cd:countSliceSchema,
      td:countSliceSchema,
      pd:countSliceSchema,
    }),
    categoryWiseConsumer: z.record(countSliceSchema),
    phaseWiseConsumer: z.record(countSliceSchema),
    oemWiseConsumer: z.record(countSliceSchema),
    consumerType: z.object({
      totalConsumers: trendSliceSchema,
      prepaid:trendSliceSchema,
      postpaid:trendSliceSchema,
      netMeter:trendSliceSchema
    }),
  }).passthrough(),
  message:z.string().optional(),
  }).strict();

export type ConsumerMetrics = z.infer<typeof consumerMetricsSchema>;

export const meterStatusSchema = z.object({
  success: z.literal(true),
  data: z.object({
    timestamp: z.string().min(1),
    totalMeterCount:z.number().nonnegative(),
    communicatedPercentage:z.string(),
    nonCommunicatedPercentage:z.string(),
  }).passthrough(),
});
export type MeterStatus = z.infer<typeof meterStatusSchema>;